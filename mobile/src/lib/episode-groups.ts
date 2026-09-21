/**
 * Grouping the chase list by episode.
 *
 * A flat list of everything overdue is the truth, and it is unreadable past
 * about a dozen rows: the same episode's script, voice and mix sit three rows
 * apart, and the one question an admin actually has — "which episode is in
 * trouble" — cannot be answered by scanning it.
 *
 * So the board asks that question first. Episodes in the order they are in
 * trouble, and the tasks underneath the one you open.
 *
 * Pure: no React, no Firebase. Unit tested.
 */

import type { Episode, Task } from "./model.ts";
import { daysUntilDue } from "./escalation.ts";

export interface EpisodeGroup {
  /** Null for work whose episode has been deleted — still somebody's problem. */
  episode: Episode | null;
  episodeId: string;
  code: string;
  title: string;
  tasks: Task[];
  /** The furthest up the ladder any of its tasks has climbed. */
  worstStep: number;
  overdue: number;
}

/**
 * Group, then order by how much trouble each episode is in: the most
 * escalated first, then the most overdue, then the most work outstanding.
 * Tasks inside a group keep the same order.
 */
export function groupByEpisode(
  tasks: readonly Task[],
  episodes: readonly Episode[],
  now: Date
): EpisodeGroup[] {
  const byId = new Map(episodes.map((e) => [e.id, e]));
  const groups = new Map<string, EpisodeGroup>();

  for (const task of tasks) {
    const id = task.episodeId;
    let group = groups.get(id);
    if (!group) {
      const episode = byId.get(id) ?? null;
      group = {
        episode,
        episodeId: id,
        code: episode?.code ?? "No episode",
        title: episode?.title ?? "",
        tasks: [],
        worstStep: 0,
        overdue: 0,
      };
      groups.set(id, group);
    }
    group.tasks.push(task);
    group.worstStep = Math.max(group.worstStep, task.remindersSent);
    if (daysUntilDue(task, now) < 0) group.overdue += 1;
  }

  return [...groups.values()].sort(
    (a, b) =>
      b.worstStep - a.worstStep ||
      b.overdue - a.overdue ||
      b.tasks.length - a.tasks.length ||
      a.code.localeCompare(b.code)
  );
}

/** "3 open · 2 overdue", or just "3 open" when none of them are late. */
export function groupSummary(group: EpisodeGroup): string {
  const open = `${group.tasks.length} open`;
  return group.overdue > 0 ? `${open} · ${group.overdue} overdue` : open;
}
