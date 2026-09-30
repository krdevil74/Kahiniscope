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
import { episodeStatusFrom } from "./episode-status.ts";
import { ratesFrom, taskStatusFrom, toAdvance, toPayment } from "./payment-convert.ts";
import {
  monthRange,
  monthKey,
  type MonthSlot,
  type MonthTotal,
} from "./payment-history.ts";
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
 */
export function useMonthlyPaidTotals(
  months: readonly MonthSlot[],
  enabled = true
): Live<MonthTotal[]> & { reload: () => void } {
  const [data, setData] = useState<MonthTotal[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  const key = months.map(monthKey).join(",");

  useEffect(() => {
    if (!enabled || months.length === 0) {
      setData([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);

    Promise.all(
      months.map(async (slot) => {
        const { start, end } = monthRange(slot);
        const snap = await getAggregateFromServer(
          query(
            collection(db, "payments"),
            where("status", "==", "paid"),
            where("paidAt", ">=", Timestamp.fromDate(start)),
            where("paidAt", "<", Timestamp.fromDate(end))
          ),
          { total: sum("finalAmount"), count: count() }
        );
        return {
          ...slot,
          total: Number(snap.data().total ?? 0),
          count: Number(snap.data().count ?? 0),
        };
      })
    )
      .then((totals) => {
        if (!live) return;
        setData(totals);
        setLoading(false);
        setError(null);
      })
      .catch((err: Error) => {
        if (!live) return;
        console.warn("payment totals", err);
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

    getDocs(
      query(
        collection(db, "payments"),
        where("status", "==", "paid"),
        where("paidAt", ">=", Timestamp.fromDate(start)),
        where("paidAt", "<", Timestamp.fromDate(end)),
        orderBy("paidAt", "desc")
      )
    )
      .then((snap) => {
        if (!live) return;
        setData(snap.docs.map(toPayment));
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
    getDocs(
      query(
        collection(db, "payments"),
        where("status", "==", "paid"),
        orderBy("paidAt", "asc"),
        fsLimit(1)
      )
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
