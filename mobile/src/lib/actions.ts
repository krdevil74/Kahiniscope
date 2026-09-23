/**
 * The writes. Everything an admin does to a task goes through here, so the
 * escalation bookkeeping is in one place and cannot drift between the three
 * screens that offer a Nudge button.
 */

import {
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  collection,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { appFunctions } from "./region.ts";

import { db } from "./firebase";
import { firstName } from "./format.ts";

import { parseScriptLink } from "./script-link.ts";
import type { ChannelId, EpisodeStatus, Task } from "./model";

/**
 * Nudge one task.
 *
 * This used to write Firestore directly and only move the ladder. It is a
 * Cloud Function now because sending needs the bot token, and because the
 * toast names the channel that actually worked — which only the server knows
 * until the message has gone.
 *
 * The bookkeeping is the same either way: remindersSent up by one,
 * lastReminderAt now. That is what makes the scheduled job's guard — has a
 * reminder already gone out today? — cover a manual nudge too, so nobody is
 * chased twice in one day.
 */
export async function nudgeTask(task: Task): Promise<{ name: string; channel: string | null }> {
  const call = httpsCallable<{ taskId: string }, { name: string; channel: string | null }>(
    appFunctions(),
    "nudgeTask"
  );
  const { data } = await call({ taskId: task.id });
  return data;
}

/** One message covering every open task, and every one of their steps bumped. */
export async function nudgeAllOpen(
  uid: string
): Promise<{ name: string; channel: string | null; count: number }> {
  const call = httpsCallable<{ uid: string }, { name: string; channel: string | null; count: number }>(
    appFunctions(),
    "nudgeAllOpen"
  );
  const { data } = await call({ uid });
  return data;
}

/**
 * Ticking a box. Marking done stops reminders immediately — there is no
 * separate cancel step, because the scheduled job only looks at tasks where
 * done is false.
 */
export async function setTaskDone(task: Task, done: boolean): Promise<void> {
  await updateDoc(doc(db, "tasks", task.id), {
    done,
    doneAt: done ? serverTimestamp() : null,
  });
}

// ---------------------------------------------------------------------------
// The copy that goes with each of them
// ---------------------------------------------------------------------------

/** The server reports the channel id; the toast says it the way people do. */
export function channelWord(channel: string | null): string {
  switch (channel) {
    case "push":
      return "push";
    case "telegram":
      return "Telegram";
    case "whatsapp":
      return "WhatsApp";
    case "sms":
      return "SMS";
    default:
      return "no channel";
  }
}

export function nudgeFailedToast(name: string, taskType: string): string {
  return `Could not reach ${firstName(name)} — ${taskType} is still open`;
}

export function nudgeToast(name: string, channel: string, taskType: string, code: string): string {
  return `Sent to ${name} via ${channel} — ${taskType}, ${code}`;
}

export function nudgeAllToast(count: number, name: string, channel: string): string {
  return `One message with ${count} task${count === 1 ? "" : "s"} sent to ${name} via ${channel}`;
}

export function nothingOpenToast(name: string): string {
  return `${firstName(name)} has nothing open`;
}

export function doneToast(taskType: string, done: boolean): string {
  return done
    ? `${taskType} marked done — reminders stopped`
    : `${taskType} reopened — reminders resume`;
}

// ---------------------------------------------------------------------------
// Creating work
// ---------------------------------------------------------------------------

export interface NewTask {
  assigneeUid: string;
  episodeId: string;
  type: string;
  dueDate: Date;
  preferredChannel: ChannelId | null;
}

/**
 * Assign a task. `assignedAt` is the server's clock, not the phone's: it is
 * the start of the 7-day countdown, and the scheduled job reads it against
 * its own clock. A phone with the wrong date would otherwise send the first
 * reminder days early or not at all.
 *
 * `episodeId` is written as a reference, as the data model specifies. The app
 * reads either form.
 */
export async function createTask(task: NewTask): Promise<string> {
  const created = await addDoc(collection(db, "tasks"), {
    episodeId: doc(db, "episodes", task.episodeId),
    assigneeUid: task.assigneeUid,
    type: task.type,
    dueDate: Timestamp.fromDate(task.dueDate),
    status: "open",
    done: false,
    doneAt: null,
    submittedAt: null,
    submissionNote: null,
    rejectedAt: null,
    rejectionNote: null,
    rejectedCount: 0,
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: serverTimestamp(),
    preferredChannel: task.preferredChannel,
  });
  return created.id;
}

/**
 * Create an episode.
 *
 * The handoff has no screen for this — the nine it describes all assume the
 * slate already exists — but a task cannot be assigned to an episode that is
 * not there, and EP-44 has to come from somewhere. The Assign form offers it
 * inline rather than sending the admin to the Firebase console.
 */
export async function createEpisode(episode: {
  code: string;
  title: string;
  airDate: Date;
}): Promise<string> {
  const created = await addDoc(collection(db, "episodes"), {
    code: episode.code.trim(),
    title: episode.title.trim(),
    airDate: Timestamp.fromDate(episode.airDate),
    status: "in_progress",
  });
  return created.id;
}

/**
 * Move an episode between in progress and broadcast.
 *
 * Nothing is deleted and no task is touched: a broadcast episode keeps its
 * work, its percentages and its payments, and an admin can still close out
 * what was already assigned. The only thing that changes is that the
 * new-task picker stops offering it — see lib/episode-status.ts.
 */
export async function setEpisodeStatus(
  episodeId: string,
  status: EpisodeStatus
): Promise<void> {
  await updateDoc(doc(db, "episodes", episodeId), { status });
}

/**
 * Put the script link on an episode, or replace the one that is there.
 *
 * Validated here as well as in the field, because this is the function every
 * caller goes through and a link that reached the database unchecked would
 * be opened by whoever tapped it. The rules check the shape a third time.
 */
export async function setEpisodeScript(
  episodeId: string,
  rawUrl: string,
  addedBy: string
): Promise<void> {
  const parsed = parseScriptLink(rawUrl);
  if (!parsed.ok) throw new Error(parsed.reason);

  await setDoc(doc(db, "episodes", episodeId, "private", "script"), {
    url: parsed.url,
    addedAt: serverTimestamp(),
    addedBy,
  });
}

export async function clearEpisodeScript(episodeId: string): Promise<void> {
  await deleteDoc(doc(db, "episodes", episodeId, "private", "script"));
}
