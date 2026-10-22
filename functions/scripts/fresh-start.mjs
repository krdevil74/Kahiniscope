/**
 * Empty the database for production, keeping the team.
 *
 * Every collection goes except `users` and `settings` (the list, and why, is
 * in functions/src/purge.ts). Episodes take their roster subcollections with
 * them. Firebase Auth accounts are not touched, so everybody who could sign
 * in still can, with the same role and approval.
 *
 * One field on the kept user documents is reset: `balance`, the advance
 * credit. It is the running total of the `advances` collection this deletes,
 * and a balance left behind would quietly pay for somebody's first real task.
 *
 * Normally run from the Actions tab — .github/workflows/fresh-start.yml.
 *
 *   # against the emulators, counting only
 *   npm run fresh-start
 *
 *   # against the emulators, for real
 *   npm run fresh-start -- --delete
 *
 * Without --delete (or mode "delete") it only counts. Repeatable: a second
 * run finds nothing to do.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { appendFileSync } from "node:fs";

import { FRESH_START_KEEPS, freshStartTargets } from "../lib/purge.js";

const apply =
  process.argv.includes("--delete") || (process.env.PURGE_MODE ?? "").toLowerCase() === "delete";
const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? "kahiniscope-demo";

/**
 * How long to wait before the second sweep. Deleting a task fires the roster
 * trigger, which may write episodes/{id}/private/roster a moment after the
 * episodes are gone; the second sweep collects anything that lands late.
 */
const SETTLE_MS = 20_000;

initializeApp({ projectId });
const db = getFirestore();

const where = process.env.FIRESTORE_EMULATOR_HOST
  ? `the emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`
  : `live Firestore for ${projectId}`;

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function counts(names) {
  const out = {};
  for (const name of names) {
    out[name] = (await db.collection(name).count().get()).data().count;
  }
  return out;
}

const usersWithBalance = () => db.collection("users").where("balance", "!=", 0);

let targets;
let before;
let keptCounts;
let balances;
try {
  const existing = (await db.listCollections()).map((c) => c.id);
  targets = freshStartTargets(existing);
  before = await counts(targets);
  keptCounts = await counts(existing.filter((n) => FRESH_START_KEEPS.includes(n)));
  balances = await usersWithBalance().get();
} catch (error) {
  fail(`Could not read ${where}: ${error.message}`);
}

console.log(`\n${apply ? "EMPTYING" : "Counting"} ${where}\n`);
console.log("  Will be emptied:");
for (const name of targets) {
  const sub = name === "episodes" ? "  (with their roster subcollections)" : "";
  console.log(`    ${name.padEnd(16)} ${String(before[name]).padStart(6)} documents${sub}`);
}
if (targets.length === 0) console.log("    nothing — only kept collections exist");

console.log("\n  Kept as they are:");
for (const [name, n] of Object.entries(keptCounts)) {
  console.log(`    ${name.padEnd(16)} ${String(n).padStart(6)} documents`);
}
console.log(`    users with an advance balance to reset to 0: ${balances.size}`);
for (const doc of balances.docs.slice(0, 10)) {
  console.log(`      ${doc.get("name") ?? doc.id}  balance=${doc.get("balance")}`);
}

if (!apply) {
  console.log('\n  DRY RUN — nothing was deleted. Re-run with mode "delete" to do it.\n');
  summarise(null);
  process.exit(0);
}

console.log("");
for (const name of targets) {
  await db.recursiveDelete(db.collection(name));
  console.log(`  emptied ${name}`);
}

if (balances.size > 0) {
  const batch = db.batch();
  for (const doc of balances.docs) batch.update(doc.ref, { balance: 0 });
  await batch.commit();
  console.log(`  reset ${balances.size} advance balance(s) to 0`);
}

console.log(`\n  Waiting ${SETTLE_MS / 1000}s for triggers to settle, then sweeping again…`);
await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
const lateTargets = freshStartTargets((await db.listCollections()).map((c) => c.id));
for (const name of lateTargets) await db.recursiveDelete(db.collection(name));

const after = await counts(lateTargets);
const left = Object.values(after).reduce((a, b) => a + b, 0);
console.log(left === 0 ? "  Everything emptied.\n" : `  ${left} documents remain: ${JSON.stringify(after)}\n`);

summarise(after);
if (left > 0) process.exit(1);

/** A record in the Actions run summary; a deletion nobody can audit is a bad deletion. */
function summarise(afterCounts) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const lines = [
    `### ${apply ? "Fresh start" : "Fresh start — dry run"}: \`${projectId}\``,
    "",
    "| Collection | Before | After |",
    "| --- | --- | --- |",
    ...targets.map(
      (n) => `| \`${n}\` | ${before[n]} | ${afterCounts ? (afterCounts[n] ?? 0) : "— dry run"} |`
    ),
    ...Object.entries(keptCounts).map(([n, c]) => `| \`${n}\` (kept) | ${c} | ${c} |`),
    "",
    `Advance balances reset to 0: ${apply ? balances.size : `${balances.size} — dry run`}`,
    "",
  ];
  appendFileSync(file, lines.join("\n") + "\n");
}
