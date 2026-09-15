/**
 * Seed settings/global — the escalation ladder, quiet hours and channel
 * switches that the Notify screen edits and the escalation function reads.
 *
 * Idempotent: it never overwrites a document that is already there, so it is
 * safe to run against production after the owner has tuned the ladder.
 *
 *   Emulator:    npm run seed
 *   Production:  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
 *                FIREBASE_PROJECT=kahiniscope-5c9ee npm run seed
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId =
  process.env.FIREBASE_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  "kahiniscope-5c9ee";

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log(`Seeding the emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
} else {
  console.log(`Seeding live Firestore for project ${projectId}`);
}

initializeApp({ projectId });
const db = getFirestore();

const defaults = {
  plan: [7, 4, 3, 2, 1],
  quietHours: { enabled: true, from: 22, to: 8, sendQueuedAt: 9 },
  // Only the free channels. WhatsApp bills per message; Textbelt's free key
  // is one SMS a day for the whole team.
  channels: { push: true, telegram: true, whatsapp: false, sms: false, email: false },
  // Episodes, tasks and reminder logs older than this are swept weekly.
  // The floor is 90 days regardless of what is written here.
  retention: { enabled: true, days: 365 },
};

const ref = db.doc("settings/global");
const existing = await ref.get();

if (existing.exists) {
  console.log("settings/global already exists — left untouched:");
  console.log(JSON.stringify(existing.data(), null, 2));
} else {
  await ref.set(defaults);
  console.log("settings/global created:");
  console.log(JSON.stringify(defaults, null, 2));
}

process.exit(0);
