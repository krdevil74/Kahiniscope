/**
 * Deleting work that should never have been there.
 *
 * An admin mistypes an episode or assigns a task to the wrong person, and
 * until now the only way back was the Firebase console. Both doors are here.
 *
 * Both are Cloud Functions rather than client writes, for two different
 * reasons:
 *
 * **A task** can be deleted by a rule — and was, until this file — but the one
 * thing that must never happen cannot be expressed in a rule. Accepting work
 * opens a payment record that names the task, so deleting an accepted task
 * leaves a payment pointing at nothing: money owed to somebody, for a job no
 * longer in the database. A rule cannot ask "does a payment name this task",
 * because payment ids are generated and there is no path to construct. So the
 * check lives here, and `firestore.rules` now refuses the direct delete.
 *
 * **An episode** cannot be deleted by a rule at all, because Firestore does not
 * cascade. `episodes/EP-12` goes and `episodes/EP-12/private/script` stays —
 * reachable, invisible, and belonging to nothing. Its tasks stay too, pointing
 * at an episode that is not there, which is a board that cannot be read and
 * reminders about an episode nobody can open. The whole tree goes together or
 * none of it does.
 *
 * Neither will touch work that has been paid for. That is not a safety rail
 * that can be overridden in the app: an episode whose work was paid for is an
 * accounting record, and the way to get it off the board is to mark it
 * broadcast, not to delete the evidence.
 */

import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

import { REGION } from "./config";

function assertAdmin(auth: { token?: Record<string, unknown> } | undefined): void {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const role = auth.token?.role;
  if ((role !== "admin" && role !== "owner") || auth.token?.status !== "approved") {
    throw new HttpsError("permission-denied", "Only an admin can delete work.");
  }
}

/**
 * Has this task been accepted?
 *
 * `done` as well as the status, because a task closed by a build that predates
 * the review flow carries `done` and nothing else — and that `done` meant
 * exactly what `approved` means now.
 */
export function isAccepted(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  return data.status === "approved" || data.status === "paid" || data.done === true;
}

/**
 * Both shapes of `episodeId`, because both are in the database: the Assign form
 * writes a DocumentReference and the seed writes a string, and a query on one
 * does not match the other. Asking only once would delete half an episode.
 */
async function tasksOfEpisode(episodeId: string) {
  const db = getFirestore();
  const [byRef, byString] = await Promise.all([
    db.collection("tasks").where("episodeId", "==", db.doc(`episodes/${episodeId}`)).get(),
    db.collection("tasks").where("episodeId", "==", episodeId).get(),
  ]);
  return [...byRef.docs, ...byString.docs];
}

/** Is any money attached to this episode, under either shape of the field? */
async function paymentsOfEpisode(episodeId: string): Promise<number> {
  const db = getFirestore();
  const [byRef, byString] = await Promise.all([
    db.collection("payments").where("episodeId", "==", db.doc(`episodes/${episodeId}`)).limit(1).get(),
    db.collection("payments").where("episodeId", "==", episodeId).limit(1).get(),
  ]);
  return byRef.size + byString.size;
}

/**
 * Delete in batches of 400.
 *
 * A Firestore batch takes 500 writes. An episode with more tasks than that is
 * not realistic, but a cap that is "surely nobody would" is a cap that fails on
 * the day somebody does.
 */
const BATCH_SIZE = 400;

async function deleteAll(refs: readonly DocumentReference[]): Promise<void> {
  const db = getFirestore();
  for (let from = 0; from < refs.length; from += BATCH_SIZE) {
    const batch = db.batch();
    for (const ref of refs.slice(from, from + BATCH_SIZE)) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * One task, removed.
 *
 * The episode roster rewrites itself: the tasks trigger fires on a delete like
 * any other write, and takes the roster down with the last task on an episode.
 */
export const deleteTask = onCall<{ taskId?: string }>({ region: REGION }, async (request) => {
  assertAdmin(request.auth);

  const taskId = request.data?.taskId;
  if (!taskId || typeof taskId !== "string") {
    throw new HttpsError("invalid-argument", "A task is required.");
  }

  const db = getFirestore();
  const ref = db.collection("tasks").doc(taskId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That task is already gone.");

  const data = snap.data();
  if (isAccepted(data)) {
    throw new HttpsError(
      "failed-precondition",
      "That work has been accepted and there is a payment against it. Delete the task and the payment points at nothing."
    );
  }

  // Belt and braces: a payment naming this task means it was accepted at some
  // point, whatever the task document now says.
  const paid = await db.collection("payments").where("taskId", "==", taskId).limit(1).get();
  if (!paid.empty) {
    throw new HttpsError(
      "failed-precondition",
      "There is already a payment for that task. It cannot be deleted."
    );
  }

  await ref.delete();

  logger.info("Task deleted", {
    taskId,
    type: data?.type ?? "",
    assigneeUid: data?.assigneeUid ?? "",
    by: request.auth?.uid,
  });

  return { type: String(data?.type ?? "Task") };
});

/**
 * One episode and everything under it.
 *
 * Ordered so that nothing is ever half-deleted in a way that reads as real:
 * the tasks go first, then the private documents, then the episode itself. An
 * episode with no tasks still appears on the slate; a task with no episode is
 * a row nobody can read.
 */
export const deleteEpisode = onCall<{ episodeId?: string }>({ region: REGION }, async (request) => {
  assertAdmin(request.auth);

  const episodeId = request.data?.episodeId;
  if (!episodeId || typeof episodeId !== "string") {
    throw new HttpsError("invalid-argument", "An episode is required.");
  }

  const db = getFirestore();
  const ref = db.collection("episodes").doc(episodeId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That episode is already gone.");

  const tasks = await tasksOfEpisode(episodeId);
  const accepted = tasks.filter((task) => isAccepted(task.data()));
  if (accepted.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      `${accepted.length} ${accepted.length === 1 ? "task" : "tasks"} on this episode ${
        accepted.length === 1 ? "has" : "have"
      } been accepted. Mark the episode broadcast instead — deleting it would take the payment record with it.`
    );
  }

  if ((await paymentsOfEpisode(episodeId)) > 0) {
    throw new HttpsError(
      "failed-precondition",
      "There are payments against this episode. It cannot be deleted."
    );
  }

  // Everything under `private/`, listed rather than assumed: today that is the
  // script and the roster, and a third document added later would otherwise be
  // left behind by a function that names only two.
  const privateDocs = await ref.collection("private").listDocuments();

  await deleteAll(tasks.map((task) => task.ref));
  await deleteAll(privateDocs);
  await ref.delete();

  logger.info("Episode deleted", {
    episodeId,
    code: snap.data()?.code ?? "",
    tasks: tasks.length,
    privateDocs: privateDocs.length,
    by: request.auth?.uid,
  });

  return {
    code: String(snap.data()?.code ?? ""),
    title: String(snap.data()?.title ?? ""),
    tasks: tasks.length,
  };
});
