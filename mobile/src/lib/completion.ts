/**
 * Completion percentages and the groupings the screens are built from.
 *
 * Percentages are never stored — the handoff is explicit about that. They are
 * counted from whatever snapshot is on screen, so two admins looking at the
 * same moment see the same number, and a task ticked on a member's phone
 * moves every percentage that contains it.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

import type { Task, TeamMember } from "./model";
import { daysUntilDue, isOverdue } from "./escalation.ts";

export interface Completion {
  done: number;
  total: number;
  /** Whole percent, 0–100. An empty set is 0%, not NaN. */
  percent: number;
}

export function completionOf(tasks: readonly Task[]): Completion {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function openTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => !t.done);
}

export function tasksForEpisode(tasks: readonly Task[], episodeId: string): Task[] {
  return tasks.filter((t) => t.episodeId === episodeId);
}

export function tasksForMember(tasks: readonly Task[], uid: string): Task[] {
  return tasks.filter((t) => t.assigneeUid === uid);
}

/** The three stat cells on the Board. */
export interface BoardStats {
  overdue: number;
  open: number;
  done: number;
}

export function boardStats(tasks: readonly Task[], now: Date): BoardStats {
  return {
    overdue: tasks.filter((t) => isOverdue(t, now)).length,
    open: tasks.filter((t) => !t.done).length,
    done: tasks.filter((t) => t.done).length,
  };
}

/**
 * The worst escalation step among a member's open tasks — what tints their
 * badge on Team and in episode detail. Done tasks do not count: a member who
 * has closed everything is clear, however late they were.
 */
export function worstStep(tasks: readonly Task[]): number {
  return tasks.reduce((worst, t) => (t.done ? worst : Math.max(worst, t.remindersSent)), 0);
}

export function overdueCount(tasks: readonly Task[], now: Date): number {
  return tasks.filter((t) => isOverdue(t, now)).length;
}

/** One member's slice of an episode: episode → members → their tasks. */
export interface MemberSlice {
  member: TeamMember;
  tasks: Task[];
  completion: Completion;
  overdue: number;
  worstStep: number;
  allDone: boolean;
}

/**
 * Members with tasks in this episode, each with their own tasks and their own
 * percentage. Members with nothing in the episode are left out.
 */
export function membersInEpisode(
  episodeTasks: readonly Task[],
  team: readonly TeamMember[],
  now: Date
): MemberSlice[] {
  return team
    .map((member) => {
      const tasks = tasksForMember(episodeTasks, member.uid);
      return {
        member,
        tasks,
        completion: completionOf(tasks),
        overdue: overdueCount(tasks, now),
        worstStep: worstStep(tasks),
        allDone: tasks.length > 0 && tasks.every((t) => t.done),
      };
    })
    .filter((slice) => slice.tasks.length > 0);
}

/** Episode codes a member currently has open work on, in slate order. */
export function openEpisodeCodes(
  tasks: readonly Task[],
  uid: string,
  codeOf: (episodeId: string) => string | undefined
): string[] {
  const codes = openTasks(tasksForMember(tasks, uid))
    .map((t) => codeOf(t.episodeId))
    .filter((code): code is string => Boolean(code));
  return [...new Set(codes)];
}

/** Episodes in air-date order, the order the slate is worked in. */
export function byAirDate<T extends { airDate: Date | null; code: string }>(
  episodes: readonly T[]
): T[] {
  return [...episodes].sort((a, b) => {
    if (a.airDate && b.airDate) return a.airDate.getTime() - b.airDate.getTime();
    if (a.airDate) return -1;
    if (b.airDate) return 1;
    return a.code.localeCompare(b.code);
  });
}

/** A member's own tasks, most urgent first. */
export function byDueDate(tasks: readonly Task[], now: Date): Task[] {
  return [...tasks].sort(
    (a, b) => Number(a.done) - Number(b.done) || daysUntilDue(a, now) - daysUntilDue(b, now)
  );
}
