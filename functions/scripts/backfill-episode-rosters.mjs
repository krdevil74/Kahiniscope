/**
 * Write the script roster for every episode that already has tasks.
 *
 * syncEpisodeRosterOnTaskWrite keeps episodes/{id}/private/roster current
 * from the moment it is deployed, but it only fires on a task *write*. Every
 * episode and task that existed before the deploy has no roster, and the
 * rules deny a script read when there is none — so without this, a script
 * linked to an existing episode is invisible to the people working on it
 * until somebody happens to edit one of their tasks.
 *
 * Run once, after deploying the trigger and the rules:
 *
 *   # against the emulators
 *   npm run backfill:rosters
 *
 *   # against production — set the project explicitly and be sure of it
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json \
 *   GCLOUD_PROJECT=kahiniscope-5c9ee node functions/scripts/backfill-episode-rosters.mjs
 *
 * Idempotent: it writes what the trigger would have written, so running it
 * twice is the same as running it once.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const projectId = process.env.GCLOUD_PROJECT ?? "kahiniscope-demo";
initializeApp({ projectId });
const db = getFirestore();

/** The same two-shape read as the trigger — tasks carry a reference or a string. */
function episodeIdOf(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.id === "string") return value.id;
  return "";
}

const tasks = await db.collection("tasks").get();

/** episodeId -> Set of uids */
const rosters = new Map();
for (const doc of tasks.docs) {
  const data = doc.data();
  const episodeId = episodeIdOf(data.episodeId);
  const uid = typeof data.assigneeUid === "string" ? data.assigneeUid : "";
  if (!episodeId || !uid) continue;
  if (!rosters.has(episodeId)) rosters.set(episodeId, new Set());
  rosters.get(episodeId).add(uid);
}

let written = 0;
for (const [episodeId, uids] of rosters) {
  await db.doc(`episodes/${episodeId}/private/roster`).set({
    uids: [...uids].sort(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  written += 1;
}

console.log(
  `Read ${tasks.size} tasks. Wrote ${written} roster${written === 1 ? "" : "s"} ` +
    `for project ${projectId}.`
);

// An episode with no tasks gets no roster, which is the same answer as an
// empty one: nobody is on it, and the rules deny the script either way.
