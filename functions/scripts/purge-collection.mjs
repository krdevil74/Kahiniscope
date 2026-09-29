/**
 * Delete everything in one collection older than one date.
 *
 * The by-hand counterpart to the weekly retention sweep: you pick the
 * collection and you pick the date, and everything dated before it goes. It
 * exists because "we kept the reminder logs from the first six months and now
 * nobody wants them" is a real request that the automatic one-year sweep
 * cannot answer.
 *
 * Normally run from the Actions tab — .github/workflows/purge-collection.yml
 * — where the collection is a dropdown and the credentials are already
 * present. Running it from a laptop means a service-account key on that
 * laptop, which is the thing the GitHub secret exists to avoid.
 *
 *   # against the emulators, counting only
 *   npm run purge:collection -- --collection reminderLog --before 2026-01-01
 *
 *   # against the emulators, for real
 *   npm run purge:collection -- --collection reminderLog --before 2026-01-01 --delete
 *
 * It counts and prints before it deletes anything, and without --delete that
 * is all it does. The rules about which collections are allowed and how
 * recent a date may be live in functions/src/purge.ts, and are tested.
 *
 * Not idempotent in the way the roster backfill is — it destroys data — but
 * it is repeatable: running it twice with the same date deletes nothing the
 * second time.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { appendFileSync } from "node:fs";

import { targetFor, cutoffFor, PURGE_TARGETS } from "../lib/purge.js";

/** Documents per query and per commit. Well under the 500-write batch limit. */
const PAGE_SIZE = 300;

/**
 * A ceiling on one run. Reaching it is not an error — it stops, says so, and
 * asks to be run again. A job that would delete a hundred thousand documents
 * is one that should be watched doing it in stages.
 */
const MAX_PER_RUN = 25_000;

/** Command line first, environment second — the workflow passes the latter. */
function input(flag, envName) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(`--${flag}`);
  if (at !== -1 && argv[at + 1] && !argv[at + 1].startsWith("--")) return argv[at + 1].trim();

  const paired = argv.find((a) => a.startsWith(`--${flag}=`));
  if (paired) return paired.slice(flag.length + 3).trim();

  return (process.env[envName] ?? "").trim();
}

const collection = input("collection", "PURGE_COLLECTION");
const before = input("before", "PURGE_BEFORE");
const apply =
  process.argv.includes("--delete") || (process.env.PURGE_MODE ?? "").toLowerCase() === "delete";

const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? "kahiniscope-demo";

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!collection) {
  fail(
    `No collection given. One of: ${PURGE_TARGETS.map((t) => t.collection).join(", ")}.`
  );
}
if (!before) fail("No date given. Write it YYYY-MM-DD — everything before it is deleted.");

let target;
let cutoff;
try {
  target = targetFor(collection);
  cutoff = cutoffFor(before);
} catch (error) {
  fail(error.message);
}

initializeApp({ projectId });
const db = getFirestore();

const where = process.env.FIRESTORE_EMULATOR_HOST
  ? `the emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`
  : `live Firestore for ${projectId}`;

console.log(`\n${apply ? "DELETING FROM" : "Counting"} ${target.collection} in ${where}`);
console.log(`  ${target.describes}`);
console.log(`  older than ${target.dateField} < ${cutoff.toISOString()} (midnight ${before}, Dhaka)`);
if (target.hasSubcollections) console.log("  subcollections go with each document");
if (!apply) console.log("  DRY RUN — nothing will be deleted\n");
else console.log("");

const cutoffStamp = Timestamp.fromDate(cutoff);
const col = db.collection(target.collection);
const old = (direction = "asc") =>
  col.where(target.dateField, "<", cutoffStamp).orderBy(target.dateField, direction);

/**
 * What is there, before touching any of it. Aggregate counts rather than a
 * read of every document: this is the step that runs on every invocation,
 * including the ones that go on to delete nothing.
 *
 * It is also the first thing to touch the database, so a bad key or an
 * emulator that is not running lands here — worth a sentence rather than a
 * gRPC stack.
 */
let matched;
let total;
try {
  [matched, total] = await Promise.all([
    old()
      .count()
      .get()
      .then((s) => s.data().count),
    col
      .count()
      .get()
      .then((s) => s.data().count),
  ]);
} catch (error) {
  fail(`Could not read ${target.collection} from ${where}: ${error.message}`);
}

console.log(`  ${matched} of ${total} documents match.`);

// Firestore's range filter skips documents that have no such field at all, so
// a document with no date is never deleted by this job and never counted by
// it either. Silence about that would read as "there were none".
const noDate = total - matched;
if (noDate > 0 && !apply) {
  console.log(
    `  ${noDate} are newer or have no ${target.dateField} at all — this job leaves both alone.`
  );
}

if (matched === 0) {
  console.log("\n  Nothing to do.\n");
  summarise(0, matched, total);
  process.exit(0);
}

// The edge of what goes: the newest documents that still qualify are the ones
// worth eyeballing, because they are the ones a wrong date takes by surprise.
const edge = await old("desc").limit(3).get();
if (!edge.empty) {
  console.log("\n  Newest documents that would go:");
  for (const doc of edge.docs) {
    const at = doc.get(target.dateField);
    const when = at?.toDate ? at.toDate().toISOString() : String(at);
    console.log(`    ${doc.id}  ${target.dateField}=${when}`);
  }
}

if (!apply) {
  console.log(`\n  Dry run. Re-run with --delete (or mode "delete") to remove these ${matched}.\n`);
  summarise(0, matched, total);
  process.exit(0);
}

let deleted = 0;
while (deleted < MAX_PER_RUN) {
  const page = await old().limit(Math.min(PAGE_SIZE, MAX_PER_RUN - deleted)).get();
  if (page.empty) break;

  if (target.hasSubcollections) {
    // Firestore does not cascade. Deleting the episode alone would leave
    // episodes/{id}/private/roster behind — unreachable from the app, still
    // billed, and still readable by anyone who knows the path.
    for (const doc of page.docs) {
      await db.recursiveDelete(doc.ref);
      deleted += 1;
    }
  } else {
    const batch = db.batch();
    for (const doc of page.docs) batch.delete(doc.ref);
    await batch.commit();
    deleted += page.size;
  }

  console.log(`  deleted ${deleted}/${matched}`);
}

const left = await old()
  .count()
  .get()
  .then((s) => s.data().count);

console.log(`\n  Deleted ${deleted} from ${target.collection}. ${left} still match.`);
if (left > 0) {
  console.log(`  Stopped at the ${MAX_PER_RUN}-document ceiling for one run — run it again.\n`);
} else {
  console.log("");
}

summarise(deleted, matched, total);

/** Leave a record in the Actions run summary; a deletion nobody can audit is a bad deletion. */
function summarise(removed, matchedCount, totalCount) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;

  const lines = [
    `### ${apply ? "Purged" : "Dry run"}: \`${target.collection}\``,
    "",
    `| | |`,
    `| --- | --- |`,
    `| Project | \`${projectId}\` |`,
    `| Cutoff | \`${target.dateField} < ${before}\` (midnight, Asia/Dhaka) |`,
    `| Matched | ${matchedCount} of ${totalCount} documents |`,
    `| Deleted | ${apply ? removed : "0 — dry run"} |`,
    "",
  ];
  appendFileSync(file, lines.join("\n") + "\n");
}

// Deliberately no confirmation prompt. This runs unattended in Actions, where
// the confirmation is typing the project id into the form, and the floor on
// how recent the date may be is what catches the mistake a prompt would have.
