/**
 * Give every episode that has already gone out a `broadcastAt`.
 *
 * The Episodes screen filters broadcast episodes by the month they went out,
 * and that date is written by the status switch from the moment it is deployed.
 * Every episode marked broadcast *before* then carries no such field — and a
 * Firestore query ordered by a field skips the documents that lack it, so those
 * episodes would be invisible in every month, for ever.
 *
 * This fills them in from `airDate`, which is the closest true thing available:
 * nobody recorded when they were actually marked, and the date they were due to
 * air is the date they went out, give or take.
 *
 * Run once, after deploying the Episodes work:
 *
 *   # against the emulators
 *   npm run backfill:broadcast
 *
 *   # against production — set the project explicitly and be sure of it
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json \
 *   GCLOUD_PROJECT=kahiniscope-5c9ee node functions/scripts/backfill-broadcast-dates.mjs
 *
 * Idempotent, and deliberately careful in one way: an episode that already has
 * a `broadcastAt` is left exactly as it is. That field is a record of when
 * something happened, and this script does not know better than the switch that
 * wrote it.
 *
 * An episode with no `airDate` either cannot be dated at all. It is counted and
 * named at the end rather than given a made-up date — a wrong date in a month
 * filter is worse than an episode that is honestly undatable.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = process.env.GCLOUD_PROJECT ?? "kahiniscope-demo";
initializeApp({ projectId });
const db = getFirestore();

/** Both spellings, because "released" is what the older documents say. */
const BROADCAST_VALUES = ["broadcast", "released"];

const episodes = await db.collection("episodes").where("status", "in", BROADCAST_VALUES).get();

let written = 0;
let alreadyDated = 0;
const undatable = [];

for (const doc of episodes.docs) {
  const data = doc.data();
  if (data.broadcastAt) {
    alreadyDated += 1;
    continue;
  }
  if (!data.airDate) {
    undatable.push(data.code ?? doc.id);
    continue;
  }
  await doc.ref.update({
    broadcastAt:
      data.airDate instanceof Timestamp ? data.airDate : Timestamp.fromDate(new Date(data.airDate)),
  });
  written += 1;
}

console.log(
  `Read ${episodes.size} broadcast episode${episodes.size === 1 ? "" : "s"} in project ${projectId}. ` +
    `Dated ${written} from the air date, left ${alreadyDated} that already had one.`
);

if (undatable.length > 0) {
  console.log(
    `\n${undatable.length} could not be dated — no air date either: ${undatable.join(", ")}.\n` +
      `They will not appear under any month on the Episodes screen. Give them an air date, ` +
      `or reopen and mark them broadcast again to stamp the date now.`
  );
}
