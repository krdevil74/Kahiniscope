/**
 * Sample slate for local work: three episodes, a team, eleven tasks spread
 * across the escalation ladder, and a reminder feed.
 *
 * Emulators only — it refuses to run against a live project, because it
 * writes user documents and would collide with real registrations.
 *
 *   npm run emulators          # in one terminal, from the repository root
 *   npm run seed:demo          # in another
 *
 * The episode titles and the ladder positions are the prototype's own, so the
 * screens can be compared against the design side by side.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "Refusing to run: FIRESTORE_EMULATOR_HOST is not set.\n" +
      "Start the emulators first (npm run emulators), then run this again."
  );
  process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT ?? "kahiniscope-demo";
initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

/** A real Drive share link shape, so the link row renders what it will in life. */
const SCRIPT_URL = "https://drive.google.com/file/d/1KahiniscopeDemoScriptFileId/view?usp=sharing";

const day = 86_400_000;
const now = Date.now();
const at = (days) => Timestamp.fromMillis(now + days * day);

/** name, crafts, how they can be reached, role */
const PEOPLE = [
  { uid: "seed-arif", name: "Arif Hossain", crafts: ["Script"], phone: "+919876500001", telegramChatId: null, role: "member" },
  { uid: "seed-nabanita", name: "Nabanita Roy", crafts: ["Translation", "Proofreading"], phone: "+919876500002", telegramChatId: "8801002", role: "member" },
  { uid: "seed-rizu", name: "Rizu Ahmed", crafts: ["Voice", "Editing"], phone: "+919876543210", telegramChatId: null, role: "member" },
  { uid: "seed-tanmoy", name: "Tanmoy Das", crafts: ["Post / mix"], phone: "+919876500004", telegramChatId: "8801004", role: "member" },
  { uid: "seed-sohag", name: "Sohag Mia", crafts: ["Graphics"], phone: "+919876500005", telegramChatId: null, role: "member" },
  { uid: "seed-piyali", name: "Piyali Sen", crafts: ["Proofreading"], phone: "+919876500006", telegramChatId: null, role: "admin" },
];

const PENDING = [
  { uid: "seed-shuvo", name: "Shuvo Karim", crafts: ["Editing"], phone: "+919876543210", registeredHoursAgo: 2, note: "Worked on EP-33 to EP-36 editing with Tanmoy. Can also do SFX cleanup." },
  { uid: "seed-mahi", name: "Mahi Chowdhury", crafts: ["Voice"], phone: "+919876500007", registeredHoursAgo: 26, note: "Sent a voice sample to your Messenger last week." },
  { uid: "seed-rupa", name: "Rupa Dutta", crafts: ["Translation"], phone: "+919876500008", registeredHoursAgo: 72, note: "Japanese to Bengali. Referred by Nabanita." },
];

/**
 * Two in progress and one already out, so the life cycle can be seen without
 * having to set it up by hand: EP-40 is broadcast, and the new-task screen
 * should not offer it.
 */
const EPISODES = [
  { id: "seed-ep40", code: "EP-40", title: "নিঝুম দ্বীপের ডাক", airInDays: -9, status: "broadcast" },
  { id: "seed-ep41", code: "EP-41", title: "রক্তমুখী নীলা", airInDays: 6, script: SCRIPT_URL },
  { id: "seed-ep42", code: "EP-42", title: "শেষ ট্রামের যাত্রী", airInDays: 13 },
  { id: "seed-ep43", code: "EP-43", title: "কুয়াশার নিচে", airInDays: 20 },
];

/** due: days from today (negative is overdue). sent/since: ladder position. */
const TASKS = [
  { ep: "seed-ep41", type: "Voice recording", who: "seed-rizu", due: -4, sent: 3, since: 1, done: false },
  { ep: "seed-ep41", type: "Dubbing / mixing", who: "seed-tanmoy", due: 2, sent: 1, since: 2, done: false },
  { ep: "seed-ep41", type: "Thumbnail / graphics", who: "seed-sohag", due: -1, sent: 2, since: 0, done: false },
  { ep: "seed-ep41", type: "Script writing", who: "seed-arif", due: -12, sent: 0, since: 0, done: true },
  { ep: "seed-ep41", type: "Editing", who: "seed-tanmoy", due: -6, sent: 4, since: 0, done: false },
  { ep: "seed-ep42", type: "Translation", who: "seed-nabanita", due: -2, sent: 2, since: 1, done: false },
  { ep: "seed-ep42", type: "Proofreading", who: "seed-piyali", due: 6, sent: 0, since: 1, done: false },
  { ep: "seed-ep42", type: "Voice recording", who: "seed-rizu", due: -9, sent: 4, since: 0, done: false },
  { ep: "seed-ep42", type: "Script writing", who: "seed-arif", due: -3, sent: 0, since: 0, done: true },
  { ep: "seed-ep43", type: "Script writing", who: "seed-arif", due: 9, sent: 0, since: 5, done: false },
  { ep: "seed-ep43", type: "Music / SFX", who: "seed-tanmoy", due: 12, sent: 0, since: 0, done: false },
  { ep: "seed-ep40", type: "Editing", who: "seed-tanmoy", due: -20, sent: 0, since: 0, done: true },
];

function userDoc(person, status) {
  return {
    name: person.name,
    email: `${person.uid.replace("seed-", "")}@example.com`,
    phone: person.phone,
    telegramChatId: person.telegramChatId ?? null,
    crafts: person.crafts,
    status,
    role: person.role ?? "member",
    fcmTokens: [],
    note: person.note ?? null,
    createdAt: person.registeredHoursAgo
      ? Timestamp.fromMillis(now - person.registeredHoursAgo * 3_600_000)
      : at(-40),
  };
}

const batch = db.batch();

for (const person of PEOPLE) {
  batch.set(db.doc(`users/${person.uid}`), userDoc(person, "approved"));
}
for (const person of PENDING) {
  batch.set(db.doc(`users/${person.uid}`), userDoc(person, "pending"));
}
for (const episode of EPISODES) {
  batch.set(db.doc(`episodes/${episode.id}`), {
    code: episode.code,
    title: episode.title,
    airDate: at(episode.airInDays),
    status: episode.status ?? "in_progress",
  });

  // The script link, where there is one. The roster beside it is written by
  // syncEpisodeRosterOnTaskWrite when the tasks below land — not here, so
  // that seeding exercises the trigger rather than standing in for it.
  if (episode.script) {
    batch.set(db.doc(`episodes/${episode.id}/private/script`), {
      url: episode.script,
      addedAt: at(-2),
      addedBy: "seed-piyali",
    });
  }
}

TASKS.forEach((task, index) => {
  const id = `seed-task-${index + 1}`;
  batch.set(db.doc(`tasks/${id}`), {
    // A reference, as the data model specifies. The app reads either.
    episodeId: db.doc(`episodes/${task.ep}`),
    assigneeUid: task.who,
    type: task.type,
    dueDate: at(task.due),
    done: task.done,
    doneAt: task.done ? at(-1) : null,
    remindersSent: task.sent,
    lastReminderAt: task.sent ? at(-task.since) : null,
    assignedAt: at(-14),
    preferredChannel: null,
  });
});

/** A morning's sends, so the reminder feed has something in it. */
const FEED = [
  { task: 8, uid: "seed-rizu", channel: "whatsapp", minutesAgo: 200, result: "delivered" },
  { task: 6, uid: "seed-nabanita", channel: "telegram", minutesAgo: 200, result: "delivered" },
  { task: 5, uid: "seed-tanmoy", channel: "sms", minutesAgo: 204, result: "delivered" },
  { task: 1, uid: "seed-rizu", channel: "push", minutesAgo: 1500, result: "failed" },
];

FEED.forEach((entry, index) => {
  batch.set(db.doc(`reminderLog/seed-log-${index + 1}`), {
    taskId: db.doc(`tasks/seed-task-${entry.task}`),
    uid: entry.uid,
    channel: entry.channel,
    sentAt: Timestamp.fromMillis(now - entry.minutesAgo * 60_000),
    result: entry.result,
    error: entry.result === "failed" ? "Token no longer registered" : null,
  });
});

batch.set(db.doc("settings/global"), {
  plan: [7, 4, 3, 2, 1],
  quietHours: { enabled: true, from: 22, to: 8, sendQueuedAt: 9 },
  channels: { push: true, telegram: true, whatsapp: true, sms: false, email: false },
});

await batch.commit();

/**
 * Auth records too, so the claim-sync trigger has someone to mint claims for
 * and the seeded people can actually be signed in as.
 */
for (const person of [...PEOPLE, ...PENDING]) {
  const email = `${person.uid.replace("seed-", "")}@example.com`;
  try {
    await auth.createUser({ uid: person.uid, email, emailVerified: true, displayName: person.name });
  } catch (err) {
    if (err.code !== "auth/uid-already-exists" && err.code !== "auth/email-already-exists") throw err;
  }

  // Link the Google identity the app's emulator sign-in presents, so that
  // signing in as this person lands on *this* uid — the one the seeded tasks
  // are assigned to — instead of minting a fresh pending account.
  try {
    await auth.updateUser(person.uid, {
      providerToLink: { providerId: "google.com", uid: `emulator-${email}`, email },
    });
  } catch (err) {
    if (err.code !== "auth/provider-already-linked") throw err;
  }
}

console.log(
  `Seeded ${EPISODES.length} episodes, ${PEOPLE.length} approved members, ` +
    `${PENDING.length} pending registrations, ${TASKS.length} tasks and ${FEED.length} log entries.`
);
console.log("Sign in as the address in OWNER_EMAILS to see the board.");
process.exit(0);
