/**
 * An episode's life cycle. Two states, and the whole point of the second one:
 *
 *   in_progress  work is still being assigned against it
 *   broadcast    it has gone out, and nothing new should be assigned to it
 *
 * Broadcast is not an archive — the episode keeps its tasks, its percentages
 * and its payments, and an admin can still close out work that was already
 * assigned. What it stops is the new-task picker offering it, which is the
 * mistake this exists to prevent: a task raised against an episode that
 * aired last month.
 *
 * No Firebase imports here, so the mapping and the filter can be tested on
 * their own.
 */

import type { Episode, EpisodeStatus } from "./model";

/**
 * Reads whatever is on the document.
 *
 * Episodes written before the life cycle existed carry "production" or
 * "released", and there are real ones in the live database. Rather than
 * migrate them, both spellings are understood here and only the new ones are
 * ever written — the old values simply age out.
 */
export function episodeStatusFrom(raw: unknown): EpisodeStatus {
  return raw === "broadcast" || raw === "released" ? "broadcast" : "in_progress";
}

export function isBroadcast(episode: Episode): boolean {
  return episode.status === "broadcast";
}

export function isInProgress(episode: Episode): boolean {
  return episode.status === "in_progress";
}

/**
 * What the new-task screen is allowed to offer. The one place this rule is
 * spelled out; every picker asks this rather than filtering for itself.
 */
export function assignableEpisodes(episodes: readonly Episode[]): Episode[] {
  return episodes.filter(isInProgress);
}

export function episodeStatusLabel(status: EpisodeStatus): string {
  return status === "broadcast" ? "Broadcast" : "In progress";
}

/** The word on the button that moves an episode to the other state. */
export function episodeStatusAction(status: EpisodeStatus): string {
  return status === "broadcast" ? "Reopen" : "Mark broadcast";
}

export function nextEpisodeStatus(status: EpisodeStatus): EpisodeStatus {
  return status === "broadcast" ? "in_progress" : "broadcast";
}

/** The toast after the switch, which says what changed rather than that it did. */
export function episodeStatusToast(code: string, status: EpisodeStatus): string {
  return status === "broadcast"
    ? `${code} is broadcast — no new tasks can be raised against it.`
    : `${code} is back in progress.`;
}

/** Counts for the Episodes subtitle. */
export function countByStatus(episodes: readonly Episode[]): {
  inProgress: number;
  broadcast: number;
} {
  let inProgress = 0;
  for (const episode of episodes) if (isInProgress(episode)) inProgress += 1;
  return { inProgress, broadcast: episodes.length - inProgress };
}
