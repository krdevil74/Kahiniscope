/**
 * The escalation job, run for real against the emulators.
 *
 * The handoff says to test it by backdating `assignedAt`, so that is what
 * this does: it plants tasks at known points on the ladder, calls the same
 * pass the 09:00 schedule calls, and checks who was chased and who was left
 * alone.
 *
 *   npm run test:escalation
 *
 * No channel can actually deliver here — there is no bot token and no FCM
 * credential in an emulator — which makes this a good test of the part that
 * matters most: every attempt is written down, and the ladder moves whether
 * or not anything got through.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  getIdTokenResult,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const OWNER_EMAIL = "owner@kahiniscope.test";
const RUN_KEY = process.env.ESCALATION_RUN_KEY ?? "test-run-key";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
const projectId = process.env.GCLOUD_PROJECT ?? "kahiniscope-demo";
const RUN_URL = `http://${fsHost}:5001/${projectId}/asia-south2/runEscalationNow`;

const apps = [];
const day = 86_400_000;

function client(name) {
  const app = initializeApp({ apiKey: "fake-api-key", projectId }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  return { app, auth, db };
}

async function signIn(ctx, { sub, email, name }) {
  const payload = JSON.stringify({ sub, email, email_verified: true, name });
  const cred = await signInWithCredential(ctx.auth, GoogleAuthProvider.credential(payload));
  return cred.user;
}

async function waitForClaims(user, predicate, label, timeoutMs = 20000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    const { claims } = await getIdTokenResult(user, true);
    last = claims;
    if (predicate(claims)) return claims;
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.fail(`Timed out waiting for ${label}. Last claims: ${JSON.stringify(last)}`);
}

async function runPass(headers = { "x-run-key": RUN_KEY }) {
  const response = await fetch(RUN_URL, { method: "POST", headers });
  return { status: response.status, body: await response.text() };
}

async function runPassJson() {
  const { status, body } = await runPass();
  assert.equal(status, 200, `escalation pass failed: ${body}`);
  return JSON.parse(body);
}

let owner;
let memberUid;

/** A task, with its clock wound back by hand. */
async function plantTask(id, { daysSinceAssigned, remindersSent = 0, daysSinceReminder = null, done = false }) {
  await setDoc(doc(owner.db, "tasks", id), {
    episodeId: doc(owner.db, "episodes", "ep41"),
    assigneeUid: memberUid,
    type: "Voice recording",
    dueDate: Timestamp.fromMillis(Date.now() - 4 * day),
    done,
    doneAt: done ? Timestamp.now() : null,
    remindersSent,
    lastReminderAt:
      daysSinceReminder === null ? null : Timestamp.fromMillis(Date.now() - daysSinceReminder * day),
    assignedAt: Timestamp.fromMillis(Date.now() - daysSinceAssigned * day),
    preferredChannel: null,
  });
}

async function clearTasks() {
  const tasks = await getDocs(collection(owner.db, "tasks"));
  await Promise.all(tasks.docs.map((d) => deleteDoc(d.ref)));
  const log = await getDocs(collection(owner.db, "reminderLog"));
  // reminderLog is closed to clients, so it is left to accumulate; tests
  // filter by task instead of assuming an empty collection.
  return log.size;
}

before(async () => {
  owner = client("escalation-owner");
  const ownerUser = await signIn(owner, { sub: "owner", email: OWNER_EMAIL, name: "Kahiniscope" });
  await waitForClaims(ownerUser, (c) => c.role === "owner", "owner claims");

  await setDoc(doc(owner.db, "settings", "global"), {
    plan: [7, 4, 3, 2, 1],
    quietHours: { enabled: false, from: 22, to: 8, sendQueuedAt: 9 },
    channels: { push: true, telegram: true, whatsapp: true, sms: false, email: false },
  });

  await setDoc(doc(owner.db, "episodes", "ep41"), {
    code: "EP-41",
    title: "রক্তমুখী নীলা",
    airDate: Timestamp.now(),
    status: "production",
  });

  const member = client("escalation-member");
  const memberUser = await signIn(member, {
    sub: "rizu",
    email: "rizu@gmail.com",
    name: "Rizu Ahmed",
  });
  memberUid = memberUser.uid;
  await waitForClaims(memberUser, (c) => c.status === "pending", "pending claims");
  await updateDoc(doc(owner.db, "users", memberUid), {
    status: "approved",
    crafts: ["Voice"],
    phone: "+8801712344192",
    telegramChatId: "900900",
  });
  await waitForClaims(memberUser, (c) => c.status === "approved", "approved claims");
});

after(async () => {
  for (const app of apps) await deleteApp(app).catch(() => {});
});

test("the run endpoint refuses anyone without the key", async () => {
  assert.equal((await runPass({})).status, 403);
  assert.equal((await runPass({ "x-run-key": "wrong" })).status, 403);
});

test("a task backdated past the first gap gets chased; a younger one does not", async () => {
  await clearTasks();
  await plantTask("due-now", { daysSinceAssigned: 8 });
  await plantTask("too-young", { daysSinceAssigned: 3 });

  const summary = await runPassJson();
  assert.equal(summary.sent, 1, JSON.stringify(summary));
  assert.equal(summary.skipped["not-due"], 1);

  const chased = await getDoc(doc(owner.db, "tasks", "due-now"));
  assert.equal(chased.data().remindersSent, 1, "the ladder moved");
  assert.ok(chased.data().lastReminderAt, "and the clock was stamped");

  const untouched = await getDoc(doc(owner.db, "tasks", "too-young"));
  assert.equal(untouched.data().remindersSent, 0);
  assert.equal(untouched.data().lastReminderAt, null);
});

test("every attempt is written to the reminder log, not just the one that worked", async () => {
  await clearTasks();
  await plantTask("logged", { daysSinceAssigned: 9 });
  await runPassJson();

  const rows = await getDocs(
    query(collection(owner.db, "reminderLog"), where("uid", "==", memberUid))
  );
  const forThisTask = rows.docs
    .map((d) => d.data())
    .filter((r) => r.taskId?.id === "logged");

  assert.ok(forThisTask.length >= 2, `expected several attempts, got ${forThisTask.length}`);
  const channels = forThisTask.map((r) => r.channel);
  assert.ok(channels.includes("push"), "push is tried first");
  assert.ok(channels.includes("telegram"), "then Telegram");
  // Nothing can actually deliver in an emulator, and that is recorded plainly.
  assert.ok(forThisTask.every((r) => r.result === "failed"));
  assert.ok(forThisTask.every((r) => typeof r.error === "string" && r.error.length > 0));
});

test("running twice in a day sends nothing twice", async () => {
  await clearTasks();
  await plantTask("once-only", { daysSinceAssigned: 8 });

  const first = await runPassJson();
  assert.equal(first.sent, 1);

  const second = await runPassJson();
  assert.equal(second.sent, 0, JSON.stringify(second));
  assert.equal(second.skipped["already-sent-today"], 1);

  const task = await getDoc(doc(owner.db, "tasks", "once-only"));
  assert.equal(task.data().remindersSent, 1, "still one, not two");
});

test("each rung of the ladder is respected", async () => {
  await clearTasks();
  // At step 1 the gap is 4 days: three days is not enough, four is.
  await plantTask("step1-early", { daysSinceAssigned: 30, remindersSent: 1, daysSinceReminder: 3 });
  await plantTask("step1-due", { daysSinceAssigned: 30, remindersSent: 1, daysSinceReminder: 4 });
  // At step 4 and beyond it is daily.
  await plantTask("daily", { daysSinceAssigned: 60, remindersSent: 9, daysSinceReminder: 1 });

  const summary = await runPassJson();
  assert.equal(summary.sent, 2, JSON.stringify(summary));

  assert.equal((await getDoc(doc(owner.db, "tasks", "step1-early"))).data().remindersSent, 1);
  assert.equal((await getDoc(doc(owner.db, "tasks", "step1-due"))).data().remindersSent, 2);
  assert.equal((await getDoc(doc(owner.db, "tasks", "daily"))).data().remindersSent, 10);
});

test("a task marked done is never chased again", async () => {
  await clearTasks();
  await plantTask("closed", { daysSinceAssigned: 40, remindersSent: 4, daysSinceReminder: 5, done: true });

  const summary = await runPassJson();
  assert.equal(summary.considered, 0, "done tasks are not even considered");
  assert.equal((await getDoc(doc(owner.db, "tasks", "closed"))).data().remindersSent, 4);
});

test("somebody whose access was revoked mid-episode is not chased", async () => {
  await clearTasks();
  await plantTask("revoked-assignee", { daysSinceAssigned: 20 });

  await updateDoc(doc(owner.db, "users", memberUid), { status: "pending" });
  const summary = await runPassJson();
  assert.equal(summary.sent, 0);
  assert.equal(summary.skipped["assignee-not-approved"], 1);

  await updateDoc(doc(owner.db, "users", memberUid), { status: "approved" });
});

test("quiet hours hold a due reminder rather than dropping it", async () => {
  await clearTasks();
  await plantTask("after-hours", { daysSinceAssigned: 12 });

  // A window that covers whatever time it is right now, wherever this runs.
  const hourInDhaka = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  ) % 24;

  await updateDoc(doc(owner.db, "settings", "global"), {
    quietHours: { enabled: true, from: hourInDhaka, to: (hourInDhaka + 2) % 24, sendQueuedAt: 9 },
  });

  const quiet = await runPassJson();
  assert.equal(quiet.sent, 0);
  assert.equal(quiet.skipped["quiet-hours"], 1);
  assert.equal((await getDoc(doc(owner.db, "tasks", "after-hours"))).data().remindersSent, 0);

  // Window closed: the same task, still due, goes out.
  await updateDoc(doc(owner.db, "settings", "global"), {
    quietHours: { enabled: false, from: 22, to: 8, sendQueuedAt: 9 },
  });
  const open = await runPassJson();
  assert.equal(open.sent, 1);
  assert.equal((await getDoc(doc(owner.db, "tasks", "after-hours"))).data().remindersSent, 1);
});

test("the ladder is read from settings, so shortening it chases sooner", async () => {
  await clearTasks();
  await plantTask("short-plan", { daysSinceAssigned: 3 });

  assert.equal((await runPassJson()).sent, 0, "7-day gap, three days in");

  await updateDoc(doc(owner.db, "settings", "global"), { plan: [2, 1] });
  assert.equal((await runPassJson()).sent, 1, "2-day gap, three days in");

  await updateDoc(doc(owner.db, "settings", "global"), { plan: [7, 4, 3, 2, 1] });
});
