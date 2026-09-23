/**
 * Who is allowed to open an episode's script.
 *
 * The rule the client asked for is "anyone who has a task under that
 * episode". Firestore rules cannot express it directly: they can get() a
 * document at a path they can construct, and task ids are generated, so
 * there is no path that answers "does this person have a task here".
 *
 * So the answer is kept as a document. Every write to a task recomputes the
 * roster for the episodes involved, and the rules read it:
 *
 *   episodes/{id}/private/roster   { uids: [...], updatedAt }
 *
 * It lives in the same subcollection as the script, under the same
 * admin-only read, so knowing who works on an episode stays with the admin —
 * maintaining the check does not publish the thing it protects.
 *
 * Recomputed by query rather than patched with arrayUnion/arrayRemove. A
 * reassignment is a single update that changes assigneeUid, and a patch
 * would have to know whether the old assignee still has *another* task on
 * the episode. The query answers that outright, and an episode's task count
 * is small enough that it is not worth being clever about.
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";

import { REGION } from "./config";

const db = () => getFirestore();

/**
 * The episode a task points at.
 *
 * `episodeId` is a DocumentReference on every task the app has ever written —
 * the data model specifies one — but the field is also read as a plain string
 * in places, and the seed and the older fixtures carry both. The client has
 * the same two-shape reader in lib/convert.ts; this is its twin, and the two
 * have to agree or the roster is built for episodes nobody is looking at.
 */
export function episodeIdOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }
  return "";
}

/** The episode ids a task write could have changed the roster for. */
export function affectedEpisodes(
  before: { episodeId?: unknown } | undefined,
  after: { episodeId?: unknown } | undefined
): string[] {
  const ids = new Set<string>();
  for (const data of [before, after]) {
    const id = episodeIdOf(data?.episodeId);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** The uids on a set of task documents, de-duplicated, order not significant. */
export function rosterFrom(
  tasks: readonly { assigneeUid?: unknown }[]
): string[] {
  const uids = new Set<string>();
  for (const task of tasks) {
    const uid = task.assigneeUid;
    if (typeof uid === "string" && uid) uids.add(uid);
  }
  return [...uids].sort();
}

async function rewriteRoster(episodeId: string): Promise<void> {
  // Both shapes, because both are in the database. A query on a string does
  // not match a reference and the other way round, so asking once would
  // build a roster from half the tasks — and half a roster is a script the
  // wrong people can open and the right ones cannot.
  const [byRef, byString] = await Promise.all([
    db().collection("tasks").where("episodeId", "==", db().doc(`episodes/${episodeId}`)).get(),
    db().collection("tasks").where("episodeId", "==", episodeId).get(),
  ]);

  const uids = rosterFrom([...byRef.docs, ...byString.docs].map((doc) => doc.data()));

  const roster = db().doc(`episodes/${episodeId}/private/roster`);

  // The last task on an episode being deleted leaves nobody, and an empty
  // roster document is the same answer as no document: the rule denies
  // either way. Removing it keeps the subcollection to what is real.
  if (uids.length === 0) {
    await roster.delete();
    return;
  }

  await roster.set({ uids, updatedAt: FieldValue.serverTimestamp() });
}

export const syncEpisodeRosterOnTaskWrite = onDocumentWritten(
  { document: "tasks/{taskId}", region: REGION },
  async (event) => {
    const episodes = affectedEpisodes(
      event.data?.before?.data(),
      event.data?.after?.data()
    );

    for (const episodeId of episodes) {
      try {
        await rewriteRoster(episodeId);
      } catch (err) {
        // One episode failing must not stop the others, and a task write is
        // never rolled back because its roster could not be rewritten: the
        // task is the record, the roster is an index onto it.
        logger.error("episode roster rewrite failed", { episodeId, err });
      }
    }
  }
);
