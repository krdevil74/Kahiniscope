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
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "./firebase";
import { toBool, toDate, toId, toNumber, toStringArray, toStringOrNull } from "./convert.ts";
import {
  DEFAULT_SETTINGS,
  type ChannelId,
  type Episode,
  type ReminderLogEntry,
  type Settings,
  type Task,
  type TeamMember,
} from "./model";

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
    status: d.status === "released" ? "released" : "production",
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
    done: toBool(d.done),
    doneAt: toDate(d.doneAt),
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
    craft: toStringOrNull(d.craft),
    status: d.status === "approved" ? "approved" : "pending",
    role: d.role === "owner" || d.role === "admin" ? d.role : "member",
    fcmTokens: toStringArray(d.fcmTokens),
    note: toStringOrNull(d.note),
    preferredChannel: (toStringOrNull(d.preferredChannel) as ChannelId | null) ?? null,
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
