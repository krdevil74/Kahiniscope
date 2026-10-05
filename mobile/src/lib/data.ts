/**
 * Live Firestore. Every list on every screen is a snapshot listener, so two
 * admins never see stale state and a task ticked on a member's phone clears
 * the board without a refresh.
 *
 * Firestore's own types stop here: the hooks hand out the plain shapes in
 * model.ts, with Timestamps already converted to Dates.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  count,
  doc,
  getAggregateFromServer,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  sum,
  Timestamp,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "./firebase";
import { toBool, toDate, toId, toNumber, toStringArray, toStringOrNull } from "./convert.ts";
import { craftsFrom } from "./crafts";
import { episodeStatusFrom, isBroadcast, storedValuesFor } from "./episode-status.ts";
import { ratesFrom, taskStatusFrom, toAdvance, toPayment } from "./payment-convert.ts";
import { monthKey, monthRange, type MonthSlot } from "./months.ts";
import { bucketByMonth, type MonthTotal } from "./payment-history.ts";
import {
  DEFAULT_SETTINGS,
  type ChannelId,
  type Episode,
  type EpisodeScript,
  type ReminderLogEntry,
  type Settings,
  type Task,
  type TeamMember,
} from "./model";
import type { Advance, Payment } from "./payments.ts";

// ---------------------------------------------------------------------------
// Converting what Firestore gives back
// ---------------------------------------------------------------------------

function toEpisode(snap: QueryDocumentSnapshot<DocumentData>): Episode {
  const d = snap.data();
  return {
    id: snap.id,
    code: d.code ?? "",
    title: d.title ?? "",
    airDate: toDate(d.airDate),
    status: episodeStatusFrom(d.status),
    broadcastAt: toDate(d.broadcastAt),
  };
}

function toTask(snap: QueryDocumentSnapshot<DocumentData>): Task {
  const d = snap.data();
  return {
    id: snap.id,
    episodeId: toId(d.episodeId),
    assigneeUid: d.assigneeUid ?? "",
    type: d.type ?? "",
    dueDate: toDate(d.dueDate),
    // Tasks written before the review flow existed carry only `done`, which
    // meant "accepted" then and still does.
    status: taskStatusFrom(d.status, d.done),
    done: toBool(d.done),
    doneAt: toDate(d.doneAt),
    submittedAt: toDate(d.submittedAt),
    submissionNote: toStringOrNull(d.submissionNote),
    rejectedAt: toDate(d.rejectedAt),
    rejectionNote: toStringOrNull(d.rejectionNote),
    rejectedCount: toNumber(d.rejectedCount),
    remindersSent: toNumber(d.remindersSent),
    lastReminderAt: toDate(d.lastReminderAt),
    assignedAt: toDate(d.assignedAt),
    preferredChannel: (d.preferredChannel as ChannelId) ?? null,
  };
}

function toMember(snap: QueryDocumentSnapshot<DocumentData>): TeamMember {
  const d = snap.data();
  return {
    uid: snap.id,
    name: d.name ?? "",
    email: d.email ?? "",
    phone: toStringOrNull(d.phone),
    telegramChatId: toStringOrNull(d.telegramChatId),
    crafts: craftsFrom(d.crafts, d.craft),
    status: d.status === "approved" ? "approved" : "pending",
    role: d.role === "owner" || d.role === "admin" ? d.role : "member",
    fcmTokens: toStringArray(d.fcmTokens),
    note: toStringOrNull(d.note),
    preferredChannel: (toStringOrNull(d.preferredChannel) as ChannelId | null) ?? null,
    accountless: d.accountless === true,
    rates: ratesFrom(d.rates),
    balance: toNumber(d.balance),
    createdAt: toDate(d.createdAt),
  };
}

function toLogEntry(snap: QueryDocumentSnapshot<DocumentData>): ReminderLogEntry {
  const d = snap.data();
  return {
    id: snap.id,
    taskId: toId(d.taskId),
    uid: d.uid ?? "",
    channel: d.channel ?? "",
    sentAt: toDate(d.sentAt),
    result: d.result === "failed" ? "failed" : "delivered",
    error: toStringOrNull(d.error),
  };
}

// ---------------------------------------------------------------------------
// The hook behind all of them
// ---------------------------------------------------------------------------

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/**
 * Once more before giving up: most of what goes wrong out here is a moment
 * long, and a screen that gives up on the first refusal tells somebody their
 * work is gone when it is not.
 */
async function retrying<T>(attempt: () => Promise<T>, delayMs = 400): Promise<T> {
  try {
    return await attempt();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return attempt();
  }
}

/** A count that answered, or nothing — which is not the same number as zero. */
function settled(result: PromiseSettledResult<number>): number | null {
  return result.status === "fulfilled" ? result.value : null;
}

function useCollection<T>(
  path: string,
  convert: (snap: QueryDocumentSnapshot<DocumentData>) => T,
  constraints: QueryConstraint[],
  /** Skip the listener entirely — e.g. a member must not query the team. */
  enabled = true
): Live<T[]> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  // Constraints are rebuilt on every render; compare by value so the
  // listener is not torn down and re-established each time.
  const key = JSON.stringify(constraints);
  const convertRef = useRef(convert);
  convertRef.current = convert;

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      query(collection(db, path), ...constraints),
      (snap) => {
        setData(snap.docs.map((doc) => convertRef.current(doc)));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn(`${path} snapshot`, err);
        setError(err);
        setLoading(false);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, enabled]);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// The collections
// ---------------------------------------------------------------------------

export function useEpisodes(enabled = true): Live<Episode[]> {
  return useCollection("episodes", toEpisode, [orderBy("airDate", "asc")], enabled);
}

/**
 * The script links for a set of episodes, keyed by episode id.
 *
 * One listener per episode rather than a collection-group query, because
 * there is no query a member could run across episodes/{id}/private that the
 * rules would accept: the roster check is per episode, and a list has to be
 * guaranteed by the query itself. A member has a handful of episodes open at
 * a time, so a handful of document listeners is the honest cost.
 *
 * An episode with no script, or one the reader has no task on, simply does
 * not appear in the map — a refused read is the expected case here, not an
 * error worth surfacing.
 */
export function useEpisodeScripts(
  episodeIds: readonly string[],
  enabled = true
): Live<Record<string, EpisodeScript>> {
  const [data, setData] = useState<Record<string, EpisodeScript>>({});
  const key = [...episodeIds].sort().join(",");

  useEffect(() => {
    if (!enabled || !key) {
      setData({});
      return;
    }
    const ids = key.split(",");
    const unsubscribes = ids.map((id) =>
      onSnapshot(
        doc(db, "episodes", id, "private", "script"),
        (snap) => {
          const script = snap.exists() ? toScript(snap.data()) : null;
          setData((current) => {
            if (!script) {
              if (!(id in current)) return current;
              const next = { ...current };
              delete next[id];
              return next;
            }
            return { ...current, [id]: script };
          });
        },
        // Refused because they have no task on this episode, which is the
        // rule working. Drop it rather than log a warning per episode.
        () => setData((current) => {
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          return next;
        })
      )
    );
    return () => unsubscribes.forEach((stop) => stop());
  }, [key, enabled]);

  return { data, loading: false, error: null };
}

function toScript(d: DocumentData): EpisodeScript | null {
  const url = typeof d.url === "string" ? d.url.trim() : "";
  if (!url) return null;
  return { url, addedAt: toDate(d.addedAt), addedBy: d.addedBy ?? "" };
}

/**
 * Tasks. An admin listens to the lot; a member may only ask for their own
 * slice, and the security rules reject any query that does not say so.
 */
export function useTasks(options: { assigneeUid?: string; enabled?: boolean } = {}): Live<Task[]> {
  const { assigneeUid, enabled = true } = options;
  const constraints = useMemo(
    () => (assigneeUid ? [where("assigneeUid", "==", assigneeUid)] : []),
    [assigneeUid]
  );
  return useCollection("tasks", toTask, constraints, enabled);
}

export interface SlateCounts {
  /** `null` is "could not be counted", which is not the same number as zero. */
  inProgress: number | null;
  broadcast: number | null;
  /** How many broadcast episodes carry a `broadcastAt`, and so can be filtered. */
  dated: number | null;
  /** Every episode, whatever is written on it — the check on the two halves. */
  total: number | null;
}

/**
 * How many episodes are on the slate, how many have gone out, and how many of
 * those the month filter can actually see.
 *
 * Four `count()` aggregations rather than the collection. The Episodes screen
 * used to load every episode ever made to put two numbers in its subtitle,
 * which is a page that gets slower every month a channel runs.
 *
 * `dated` is the quiet one: how many broadcast episodes carry a `broadcastAt`.
 * An episode marked broadcast before that field existed has none, and an
 * aggregation ordered by a field skips the documents that lack it — so the gap
 * between `broadcast` and `dated` is exactly how many episodes the month filter
 * cannot see, and the screen says so rather than hiding them.
 *
 * `total` is the same idea one level up. Both halves ask the server for named
 * status spellings, so an episode stored as anything else is in neither query
 * and appears nowhere at all — where before the split it was folded into "in
 * progress" on the phone and at least visible. `total` is what lets the screen
 * notice that and say it.
 *
 * Gathered with `allSettled` and each one retried, because these four were a
 * `Promise.all`: one refusal zeroed all of them, and a tile reading 0 is a
 * statement about the channel rather than about the connection. A count that
 * did not answer comes back as `null` and is drawn as a dash.
 */
export function useEpisodeCounts(
  enabled = true
): Live<SlateCounts> & { reload: () => void } {
  const [data, setData] = useState<SlateCounts>({
    inProgress: null,
    broadcast: null,
    dated: null,
    total: null,
  });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);

    const episodes = collection(db, "episodes");
    const counted = (...constraints: QueryConstraint[]) =>
      retrying(async () => {
        const snap = await getAggregateFromServer(query(episodes, ...constraints), {
          n: count(),
        });
        return Number(snap.data().n ?? 0);
      });

    void Promise.allSettled([
      counted(where("status", "in", storedValuesFor("in_progress"))),
      counted(where("status", "in", storedValuesFor("broadcast"))),
      // How many carry a date at all. Ordered by the field and nothing else,
      // because an aggregation ordered by a field skips the documents that
      // lack it — which is the whole point of this number — and because one
      // field needs no composite index.
      counted(orderBy("broadcastAt")),
      counted(),
    ]).then((results) => {
      if (!live) return;
      const [inProgress, broadcast, dated, total] = results;
      setData({
        inProgress: settled(inProgress),
        broadcast: settled(broadcast),
        dated: settled(dated),
        total: settled(total),
      });
      const refused = results.find((result) => result.status === "rejected");
      if (refused && refused.status === "rejected") {
        console.warn("episode counts", refused.reason);
        setError(refused.reason as Error);
      } else {
        setError(null);
      }
      setLoading(false);
    });

    return () => {
      live = false;
    };
  }, [enabled, version]);

  return { data, loading, error, reload: () => setVersion((v) => v + 1) };
}

/**
 * The slate: episodes still being worked on.
 *
 * A live listener, because this is the working set — an episode marked
 * broadcast on another admin's phone should leave this list — and it is bounded
 * by what is in production rather than by everything ever made.
 */
export function useEpisodesInProgress(enabled = true): Live<Episode[]> {
  const constraints = useMemo(
    () => [where("status", "in", storedValuesFor("in_progress"))],
    []
  );
  return useCollection("episodes", toEpisode, constraints, enabled);
}

/**
 * The episodes that went out in one month, fetched when somebody opens it.
 *
 * On `broadcastAt` rather than `airDate`: the question is which episodes went
 * out in October, and an episode due in September but marked broadcast in
 * October went out in October. An episode with no `broadcastAt` is invisible
 * here, which is what the counts above exist to say out loud.
 */
export function useBroadcastInMonth(
  slot: MonthSlot | null,
  enabled = true
): Live<Episode[]> & { reload: () => void } {
  const [data, setData] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  const key = slot ? monthKey(slot) : "";

  useEffect(() => {
    if (!enabled || !slot) {
      setData([]);
      setError(null);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    const { start, end } = monthRange(slot);

    // On `broadcastAt` alone. A `status in [...]` beside a range is two
    // fields and a composite index; the date on its own needs nothing. It is
    // also exact: the status switch stamps `broadcastAt` when an episode goes
    // out and clears it when one is reopened, so an episode with a date in
    // this month went out in this month. The status is checked below, on
    // documents already in hand.
    //
    // Retried, because the alternative reads as a month nothing went out in.
    retrying(() =>
      getDocs(
        query(
          collection(db, "episodes"),
          where("broadcastAt", ">=", Timestamp.fromDate(start)),
          where("broadcastAt", "<", Timestamp.fromDate(end)),
          orderBy("broadcastAt", "desc")
        )
      )
    )
      .then((snap) => {
        if (!live) return;
        setData(snap.docs.map(toEpisode).filter(isBroadcast));
        setLoading(false);
        setError(null);
      })
      .catch((err: Error) => {
        if (!live) return;
        console.warn("broadcast episodes", err);
        setError(err);
        setLoading(false);
      });

    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, version]);

  return { data, loading, error, reload: () => setVersion((v) => v + 1) };
}

/** The month of the first episode to go out, for the year filter. */
export function useEarliestBroadcastYear(enabled = true): number | null {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // Retried: a year the filter never offers is a year of episodes nobody can
    // reach, and the only sign of it is a chip that is not there.
    retrying(() =>
      getDocs(query(collection(db, "episodes"), orderBy("broadcastAt", "asc"), fsLimit(1)))
    )
      .then((snap) => {
        if (!live || snap.empty) return;
        const first = toEpisode(snap.docs[0]).broadcastAt;
        if (first) setYear(first.getFullYear());
      })
      .catch((err) => console.warn("earliest broadcast", err));
    return () => {
      live = false;
    };
  }, [enabled]);

  return year;
}

/**
 * The tasks belonging to a handful of episodes, for the cards on screen.
 *
 * Two queries because `episodeId` is a DocumentReference on everything the
 * Assign form wrote and a string on everything the seed wrote, and a query on
 * one shape does not match the other. Chunked at 30 because that is the limit
 * on `in`, and only ever asked for the episodes actually listed — which is what
 * keeps a page of ten episodes costing the tasks of ten episodes.
 */
export function useTasksForEpisodes(
  episodeIds: readonly string[],
  enabled = true
): Live<Task[]> {
  const [data, setData] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const key = [...episodeIds].sort().join(",");

  useEffect(() => {
    if (!enabled || episodeIds.length === 0) {
      setData([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);

    const ids = [...episodeIds];
    const chunks: string[][] = [];
    for (let from = 0; from < ids.length; from += 30) chunks.push(ids.slice(from, from + 30));

    Promise.all(
      chunks.flatMap((chunk) => [
        getDocs(query(collection(db, "tasks"), where("episodeId", "in", chunk))),
        getDocs(
          query(
            collection(db, "tasks"),
            where(
              "episodeId",
              "in",
              chunk.map((id) => doc(db, "episodes", id))
            )
          )
        ),
      ])
    )
      .then((snaps) => {
        if (!live) return;
        const seen = new Set<string>();
        const tasks: Task[] = [];
        for (const snap of snaps) {
          for (const task of snap.docs) {
            if (seen.has(task.id)) continue;
            seen.add(task.id);
            tasks.push(toTask(task));
          }
        }
        setData(tasks);
        setLoading(false);
        setError(null);
      })
      .catch((err: Error) => {
        if (!live) return;
        console.warn("tasks for episodes", err);
        setError(err);
        setLoading(false);
      });

    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { data, loading, error };
}

/** Everyone, pending included. The Team screen filters; Requests does not. */
export function useTeam(enabled = true): Live<TeamMember[]> {
  return useCollection("users", toMember, [], enabled);
}

/**
 * A member's own payments. Every one of them, because a member's own history
 * is their earnings and the whole screen is about the total.
 *
 * The admin does **not** use this. Their side is three bounded queries below —
 * the whole collection was the thing making that screen slower every month.
 */
export function usePayments(
  options: { uid?: string; enabled?: boolean } = {}
): Live<Payment[]> {
  const { uid, enabled = true } = options;
  const constraints = useMemo(() => (uid ? [where("uid", "==", uid)] : []), [uid]);
  return useCollection("payments", toPayment, constraints, enabled);
}

/**
 * What is owed right now.
 *
 * Still a live listener, because two admins working the same queue is the
 * ordinary case and the one place staleness would cost money. It is bounded by
 * the work in flight rather than by history: paying something removes it from
 * this query forever.
 */
export function usePendingPayments(enabled = true): Live<Payment[]> {
  const constraints = useMemo(() => [where("status", "==", "pending")], []);
  return useCollection("payments", toPayment, constraints, enabled);
}

/**
 * The payments inside a half-open range, which all three month questions ask.
 *
 * **On `paidAt` alone, with no `status` filter**, and that is the fix for a
 * screen that spent a week saying it could not add anything up. `status ==
 * "paid"` beside a range on `paidAt` is two fields, and two fields need a
 * composite index; `paidAt` on its own needs nothing but the single-field
 * index every field gets for free. The split in production was exact — every
 * query here that wanted a composite index failed, and every query that did
 * not, worked.
 *
 * Nothing is let in by dropping it. `paidAt` is written in the same breath as
 * `status: "paid"` and is null on every payment that has not been paid
 * (functions/src/review.ts), so a payment with a `paidAt` *is* a paid payment.
 * The callers that read documents still check the status in memory, which
 * costs nothing on a document already fetched and keeps a hand-edited record
 * from sneaking in.
 */
function paidBetween(start: Date, end: Date, ...extra: QueryConstraint[]) {
  return query(
    collection(db, "payments"),
    where("paidAt", ">=", Timestamp.fromDate(start)),
    where("paidAt", "<", Timestamp.fromDate(end)),
    ...extra
  );
}

/** The guard the query no longer carries, applied to what came back. */
const isPaid = (payment: Payment) => payment.status === "paid";

/**
 * How many aggregations are in flight at once.
 *
 * Twelve bars used to mean twelve requests opened together, and on a phone
 * that is where this broke: one of them erroring took the whole chart with it,
 * and the screen then said "No payments yet" about an operation that had paid
 * people that week. Four at a time, and the ones that fail are retried.
 */
const MONTH_CONCURRENCY = 4;

/**
 * The ceiling on the fallback read, when the aggregations will not answer.
 *
 * It is a ceiling rather than a page because the alternative is the thing this
 * whole module exists to stop: reading the collection to draw a chart. Five
 * hundred documents is a year of a busy operation and a bounded cost, and when
 * it is hit the screen says the oldest months in view may be short rather than
 * quietly drawing a short bar.
 */
export const WINDOW_READ_LIMIT = 500;

/** One bar: a sum and a count, added up by Firestore in the index. */
async function aggregateMonth(slot: MonthSlot): Promise<MonthTotal> {
  const { start, end } = monthRange(slot);
  const snap = await getAggregateFromServer(paidBetween(start, end), {
    total: sum("finalAmount"),
    count: count(),
  });
  return {
    ...slot,
    total: Number(snap.data().total ?? 0),
    count: Number(snap.data().count ?? 0),
  };
}

/** Every bar, a few at a time. Rejects if any month still will not answer. */
async function aggregateMonths(months: readonly MonthSlot[]): Promise<MonthTotal[]> {
  const totals: MonthTotal[] = new Array(months.length);
  let next = 0;
  const worker = async () => {
    while (next < months.length) {
      const index = next;
      next += 1;
      totals[index] = await retrying(() => aggregateMonth(months[index]));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MONTH_CONCURRENCY, months.length) }, worker)
  );
  return totals;
}

/**
 * The way back: one read of the whole window, added up on the phone.
 *
 * Aggregations are the right way to draw this chart and the only one that does
 * not get slower every month. But an admin who cannot see what went out is not
 * helped by a screen that is cheap, so when the index will not answer this
 * reads the window once — ordered newest first and capped — and buckets it.
 */
async function readMonths(
  months: readonly MonthSlot[]
): Promise<{ totals: MonthTotal[]; partial: boolean }> {
  const { start } = monthRange(months[0]);
  const { end } = monthRange(months[months.length - 1]);
  const snap = await getDocs(
    paidBetween(start, end, orderBy("paidAt", "desc"), fsLimit(WINDOW_READ_LIMIT))
  );
  return {
    totals: bucketByMonth(months, snap.docs.map(toPayment).filter(isPaid)),
    partial: snap.size >= WINDOW_READ_LIMIT,
  };
}

export interface MonthlyTotals extends Live<MonthTotal[]> {
  /** The bars were added up on the phone because the aggregations would not answer. */
  degraded: boolean;
  /** The fallback read hit its ceiling, so the oldest months in view may be short. */
  partial: boolean;
  reload: () => void;
}

/**
 * What went out each month — as a sum and a count, never as documents.
 *
 * One aggregation query per bar. Firestore does the adding in the index and
 * sends back two numbers, so twelve months of history cost the same whether
 * they hold four payments or four thousand. This is the whole reason the
 * admin's Payments tab stopped getting slower.
 *
 * Not a listener: a month that has closed cannot change, and the current one
 * only changes when this admin marks something paid — which is what `reload`
 * is for.
 *
 * What it will not do is pretend. Twelve aggregations fired at once, with one
 * rejection discarding all twelve, is how this screen came to say "No payments
 * yet" to an operation that had paid six people that week. So the months are
 * asked a few at a time and retried, there is a bounded read behind them if
 * the aggregations cannot be had at all, and if even that fails the error
 * comes back out to be said on screen rather than being logged and dressed up
 * as an empty month.
 */
export function useMonthlyPaidTotals(
  months: readonly MonthSlot[],
  enabled = true
): MonthlyTotals {
  const [data, setData] = useState<MonthTotal[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  const key = months.map(monthKey).join(",");

  useEffect(() => {
    if (!enabled || months.length === 0) {
      setData([]);
      setDegraded(false);
      setPartial(false);
      setError(null);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);

    void (async () => {
      try {
        const totals = await aggregateMonths(months);
        if (!live) return;
        setData(totals);
        setDegraded(false);
        setPartial(false);
        setError(null);
      } catch (aggregation) {
        if (!live) return;
        console.warn("payment totals", aggregation);
        try {
          const read = await readMonths(months);
          if (!live) return;
          setData(read.totals);
          setDegraded(true);
          setPartial(read.partial);
          setError(null);
        } catch (documents) {
          if (!live) return;
          console.warn("payment totals fallback", documents);
          setData([]);
          setDegraded(false);
          setPartial(false);
          setError(documents as Error);
        }
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, version]);

  return { data, loading, error, degraded, partial, reload: () => setVersion((v) => v + 1) };
}

/**
 * The payments that made up one month, fetched when somebody opens it.
 *
 * A one-shot read rather than a listener, and only for the month on screen —
 * so what an admin loads is what they chose to look at.
 */
export function usePaidInMonth(
  slot: MonthSlot | null,
  enabled = true
): Live<Payment[]> & { reload: () => void } {
  const [data, setData] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  const key = slot ? monthKey(slot) : "";

  useEffect(() => {
    if (!enabled || !slot) {
      setData([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    const { start, end } = monthRange(slot);

    getDocs(paidBetween(start, end, orderBy("paidAt", "desc")))
      .then((snap) => {
        if (!live) return;
        setData(snap.docs.map(toPayment).filter(isPaid));
        setLoading(false);
        setError(null);
      })
      .catch((err: Error) => {
        if (!live) return;
        console.warn("payments in month", err);
        setError(err);
        setLoading(false);
      });

    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, version]);

  return { data, loading, error, reload: () => setVersion((v) => v + 1) };
}

/**
 * The year of the first payment ever made, for the year filter.
 *
 * One document — the oldest paid payment — rather than the collection. The
 * filter needs to know how far back to offer, and that is the cheapest
 * possible way to ask.
 */
export function useEarliestPaidYear(enabled = true): number | null {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // Retried, because a year the filter never offers is a year of history
    // that cannot be reached at all — and the only sign is a chip not there.
    retrying(() =>
      getDocs(query(collection(db, "payments"), orderBy("paidAt", "asc"), fsLimit(1)))
    )
      .then((snap) => {
        if (!live || snap.empty) return;
        const first = toPayment(snap.docs[0]).paidAt;
        if (first) setYear(first.getFullYear());
      })
      .catch((err) => console.warn("earliest payment", err));
    return () => {
      live = false;
    };
  }, [enabled]);

  return year;
}

/**
 * Advances: money handed over before the work existed. Own or admin, like
 * payments, and a member's query has to name the condition.
 */
export function useAdvances(
  options: { uid?: string; enabled?: boolean } = {}
): Live<Advance[]> {
  const { uid, enabled = true } = options;
  const constraints = useMemo(() => (uid ? [where("uid", "==", uid)] : []), [uid]);
  return useCollection("advances", toAdvance, constraints, enabled);
}

export function useReminderFeed(count = 12, enabled = true): Live<ReminderLogEntry[]> {
  const constraints = useMemo(
    () => [orderBy("sentAt", "desc"), fsLimit(count)],
    [count]
  );
  return useCollection("reminderLog", toLogEntry, constraints, enabled);
}

/**
 * settings/global. Every countdown in the app is computed from `plan`, so
 * this falls back to the documented default rather than to nothing: a missing
 * settings document must not make the ladder disappear.
 */
export function useSettings(enabled = true): Live<Settings> {
  const [data, setData] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      collection(db, "settings"),
      (snap) => {
        const global = snap.docs.find((d) => d.id === "global")?.data();
        setData({
          plan:
            Array.isArray(global?.plan) && global.plan.length
              ? global.plan.filter((n: unknown) => typeof n === "number" && n >= 1)
              : DEFAULT_SETTINGS.plan,
          quietHours: { ...DEFAULT_SETTINGS.quietHours, ...(global?.quietHours ?? {}) },
          channels: { ...DEFAULT_SETTINGS.channels, ...(global?.channels ?? {}) },
        });
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("settings snapshot", err);
        setError(err);
        setLoading(false);
      }
    );
  }, [enabled]);

  return { data, loading, error };
}

/**
 * A clock that ticks often enough for "4d overdue" to be true. Every label on
 * every screen is relative to a day boundary, so the app cannot read `new
 * Date()` once at mount and be right an hour later.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Index helpers, so screens do not write the same find() over and over. */
export function indexBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Map<K, T> {
  return new Map(items.map((item) => [key(item), item]));
}
