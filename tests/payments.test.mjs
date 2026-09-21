/**
 * Work handed in, reviewed, and paid for — against the Auth + Firestore +
 * Functions emulators.
 *
 * The parts worth proving are the ones no unit test can reach: that a member
 * can hand work in but not accept it, that approving opens a payment carrying
 * the rate as it stood at that moment, that the figure an admin actually pays
 * is allowed to differ from the estimate, and that a rejection puts the task
 * back where the escalation engine will chase it every other day.
 *
 *   npm run test:payments
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
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const OWNER_EMAIL = "owner@kahiniscope.test";
const REGION = "asia-south2";

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
const projectId = process.env.GCLOUD_PROJECT ?? "kahiniscope-demo";

const apps = [];

function client(name) {
  const app = initializeApp({ apiKey: "fake-api-key", projectId }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  const functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, fsHost, 5001);
  return { app, auth, db, functions };
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

const call = (ctx, name, data) => httpsCallable(ctx.functions, name)(data);

let owner;
let artist;
let artistUser;

async function newTask(type = "Voice recording") {
  const created = await addDoc(collection(owner.db, "tasks"), {
    episodeId: doc(owner.db, "episodes", "ep61"),
    assigneeUid: artistUser.uid,
    type,
    dueDate: Timestamp.now(),
    status: "open",
    done: false,
    doneAt: null,
    submittedAt: null,
    rejectedAt: null,
    rejectionNote: null,
    rejectedCount: 0,
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: serverTimestamp(),
    preferredChannel: null,
  });
  return created.id;
}

const read = async (path, id) => (await getDoc(doc(owner.db, path, id))).data();

before(async () => {
  owner = client("pay-owner");
  const ownerUser = await signIn(owner, { sub: "owner", email: OWNER_EMAIL, name: "Kahiniscope" });
  await waitForClaims(ownerUser, (c) => c.role === "owner", "owner claims");

  await setDoc(doc(owner.db, "episodes", "ep61"), {
    code: "EP-61",
    title: "রক্তমুখী নীলা",
    airDate: Timestamp.now(),
    status: "production",
  });

  artist = client("pay-artist");
  artistUser = await signIn(artist, { sub: "artist", email: "artist@gmail.com", name: "Rizu Ahmed" });
  await waitForClaims(artistUser, (c) => c.status === "pending", "pending claims");

  await updateDoc(doc(artist.db, "users", artistUser.uid), {
    phone: "+919876543210",
    crafts: ["Voice"],
  });
  // Approved, and put on a rate card: ₹50 a minute in character, ₹35 reading.
  await updateDoc(doc(owner.db, "users", artistUser.uid), {
    status: "approved",
    rates: { voiceCharacter: 50, voiceNarration: 35, soundDesign: null, cover: null },
  });
  await waitForClaims(artistUser, (c) => c.status === "approved", "approved claims");
});

after(async () => {
  for (const app of apps) await deleteApp(app).catch(() => {});
});

test("a member hands work in, and cannot accept it themselves", async () => {
  const taskId = await newTask();

  await updateDoc(doc(artist.db, "tasks", taskId), {
    status: "submitted",
    submittedAt: Timestamp.now(),
  });
  assert.equal((await read("tasks", taskId)).status, "submitted");

  // The rules stop the obvious shortcut; the callable stops the other one.
  await assert.rejects(() => updateDoc(doc(artist.db, "tasks", taskId), { status: "approved" }));
  await assert.rejects(
    () => call(artist, "reviewTask", { taskId, decision: "approve", unit: "voice-character" }),
    /admin/
  );
});

test("sending work back carries a reason, and restarts the clock", async () => {
  const taskId = await newTask();
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });
  // Pretend the ladder had already run a while before it was handed in.
  await updateDoc(doc(owner.db, "tasks", taskId), { remindersSent: 4 });

  await assert.rejects(
    () => call(owner, "reviewTask", { taskId, decision: "reject", note: "  " }),
    /why/i,
    "a bare refusal is not feedback"
  );

  await call(owner, "reviewTask", {
    taskId,
    decision: "reject",
    note: "Levels are too hot from 4:10.",
  });

  const task = await read("tasks", taskId);
  assert.equal(task.status, "open", "it is work somebody still owes");
  assert.equal(task.done, false);
  assert.equal(task.rejectionNote, "Levels are too hot from 4:10.");
  assert.equal(task.rejectedCount, 1);
  assert.ok(task.rejectedAt, "what turns the ladder into the every-other-day chase");
  assert.equal(task.remindersSent, 0, "the clock restarts");
  assert.equal(task.lastReminderAt, null);

  // And the member can hand it in again.
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });
  assert.equal((await read("tasks", taskId)).status, "submitted");
});

test("approving opens a payment at the rate that applied when it was approved", async () => {
  const taskId = await newTask();
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });

  const { data } = await call(owner, "reviewTask", {
    taskId,
    decision: "approve",
    unit: "voice-character",
    recordingMinutes: 12,
    comment: "Lovely read.",
  });

  assert.equal(data.estimatedAmount, 600, "12 minutes at ₹50");

  const task = await read("tasks", taskId);
  assert.equal(task.status, "approved");
  assert.equal(task.done, true, "every percentage on every screen still reads this");

  const payment = await read("payments", data.paymentId);
  assert.equal(payment.status, "pending");
  assert.equal(payment.uid, artistUser.uid);
  assert.equal(payment.unit, "voice-character");
  assert.equal(payment.quantity, 12);
  assert.equal(payment.rate, 50);
  assert.equal(payment.estimatedAmount, 600);
  assert.equal(payment.finalAmount, null, "nothing has been paid yet");

  // Raising the rate must not restate what this work was worth.
  await updateDoc(doc(owner.db, "users", artistUser.uid), {
    rates: { voiceCharacter: 80, voiceNarration: 35, soundDesign: null, cover: null },
  });
  assert.equal((await read("payments", data.paymentId)).rate, 50);
});

test("the same artist is worth a different rate reading narration", async () => {
  const taskId = await newTask();
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });

  const { data } = await call(owner, "reviewTask", {
    taskId,
    decision: "approve",
    unit: "voice-narration",
    recordingMinutes: 10,
  });
  assert.equal(data.estimatedAmount, 350, "10 minutes at ₹35, not the character rate");
});

test("work with no rate behind it is approved on a typed figure", async () => {
  const taskId = await newTask("Script writing");
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });

  const { data } = await call(owner, "reviewTask", {
    taskId,
    decision: "approve",
    unit: "manual",
    wordCount: 1800,
    amount: 1500,
  });

  const payment = await read("payments", data.paymentId);
  assert.equal(payment.rate, null);
  assert.equal(payment.wordCount, 1800, "context for the admin, not a multiplier");
  assert.equal(payment.estimatedAmount, 1500);
});

test("a kind of work cannot be approved under a unit it is not paid in", async () => {
  const taskId = await newTask("Script writing");
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });
  await assert.rejects(
    () => call(owner, "reviewTask", { taskId, decision: "approve", unit: "cover" }),
    /not a way this kind of task is paid/
  );
});

test("what is paid is allowed to differ from what was estimated", async () => {
  const taskId = await newTask();
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });
  const { data } = await call(owner, "reviewTask", {
    taskId,
    decision: "approve",
    unit: "voice-character",
    recordingMinutes: 12,
  });

  await assert.rejects(
    () => call(owner, "markPaymentPaid", { paymentId: data.paymentId }),
    /actually paid/,
    "the amount is the whole point of the document"
  );

  // The quality was not what was hoped for. That is the admin's call, and it
  // is why the app never calls an estimate a promise.
  await call(owner, "markPaymentPaid", { paymentId: data.paymentId, amount: 550 });

  const payment = await read("payments", data.paymentId);
  assert.equal(payment.status, "paid");
  assert.equal(payment.finalAmount, 550);
  assert.equal(payment.estimatedAmount, 960, "what the rate said at the time, kept as it was");
  assert.equal((await read("tasks", taskId)).status, "paid");

  await assert.rejects(
    () => call(owner, "markPaymentPaid", { paymentId: data.paymentId, amount: 900 }),
    /already paid/
  );
});

test("a member reads their own payments and nobody else's", async () => {
  const mine = await getDocs(
    query(collection(artist.db, "payments"), where("uid", "==", artistUser.uid))
  );
  assert.ok(mine.size > 0);

  // The whole collection is not theirs to read.
  await assert.rejects(() => getDocs(collection(artist.db, "payments")));

  // Nor is the amount theirs to write.
  const anyPayment = mine.docs[0];
  await assert.rejects(() =>
    updateDoc(doc(artist.db, "payments", anyPayment.id), { finalAmount: 99999 })
  );
});

test("only work that is waiting can be reviewed", async () => {
  const taskId = await newTask();
  await assert.rejects(
    () => call(owner, "reviewTask", { taskId, decision: "approve", unit: "voice-character", recordingMinutes: 1 }),
    /not waiting for review/
  );
});

// ---------------------------------------------------------------------------
// Advances
// ---------------------------------------------------------------------------

const balanceOf = async (uid) => Number((await read("users", uid)).balance ?? 0);

test("an advance is money now, against work that does not exist yet", async () => {
  const before = await balanceOf(artistUser.uid);

  const { data } = await call(owner, "addAdvance", {
    uid: artistUser.uid,
    amount: 5000,
    note: "Before EP-61",
  });

  assert.equal(data.balance, before + 5000);
  assert.equal(await balanceOf(artistUser.uid), before + 5000);

  // And it is its own record, because "where did this balance come from" is a
  // question somebody will ask.
  const advance = await read("advances", data.advanceId);
  assert.equal(advance.uid, artistUser.uid);
  assert.equal(advance.amount, 5000);
  assert.equal(advance.note, "Before EP-61");
});

test("nothing is advanced without a figure, and not by a member", async () => {
  await assert.rejects(() => call(owner, "addAdvance", { uid: artistUser.uid }), /how much/i);
  await assert.rejects(
    () => call(owner, "addAdvance", { uid: artistUser.uid, amount: 0 }),
    /how much/i
  );
  await assert.rejects(
    () => call(artist, "addAdvance", { uid: artistUser.uid, amount: 100 }),
    /admin/
  );
});

test("approved work comes straight off the balance, and is paid on the spot", async () => {
  const before = await balanceOf(artistUser.uid);
  assert.ok(before >= 600, "the earlier advance is what this spends");

  const taskId = await newTask();
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });

  // 12 minutes in character. The rate was raised to ₹80 by an earlier test.
  const { data } = await call(owner, "reviewTask", {
    taskId,
    decision: "approve",
    unit: "voice-character",
    recordingMinutes: 5,
  });

  const expected = 5 * 80;
  assert.equal(data.settledFromAdvance, true);
  assert.equal(data.estimatedAmount, expected);
  assert.equal(data.balanceAfter, before - expected);
  assert.equal(await balanceOf(artistUser.uid), before - expected);

  // No queue entry: there is nothing left for an admin to do about it.
  const payment = await read("payments", data.paymentId);
  assert.equal(payment.status, "paid");
  assert.equal(payment.finalAmount, expected);
  assert.equal(payment.settledFromAdvance, true);
  assert.ok(payment.paidAt);

  assert.equal((await read("tasks", taskId)).status, "paid");
});

test("a balance that does not cover the work is left alone", async () => {
  // Spend it down to something small, then approve something bigger.
  const balance = await balanceOf(artistUser.uid);
  const taskId = await newTask("Script writing");
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });

  const { data } = await call(owner, "reviewTask", {
    taskId,
    decision: "approve",
    unit: "manual",
    amount: balance + 1000,
  });

  assert.equal(data.settledFromAdvance, false, "all or nothing: never part-spent");
  assert.equal(await balanceOf(artistUser.uid), balance, "untouched");
  assert.equal((await read("payments", data.paymentId)).status, "pending");
  assert.equal((await read("tasks", taskId)).status, "approved");
});

test("work with no figure behind it cannot be settled from an advance", async () => {
  const balance = await balanceOf(artistUser.uid);
  const taskId = await newTask("Editing");
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });

  // No rate for editing, and no amount typed: there is nothing to spend.
  const { data } = await call(owner, "reviewTask", { taskId, decision: "approve", unit: "manual" });

  assert.equal(data.settledFromAdvance, false);
  assert.equal(data.estimatedAmount, null);
  assert.equal(await balanceOf(artistUser.uid), balance);
});

test("a member reads their own advances and nobody else's", async () => {
  const mine = await getDocs(
    query(collection(artist.db, "advances"), where("uid", "==", artistUser.uid))
  );
  assert.ok(mine.size > 0);
  await assert.rejects(() => getDocs(collection(artist.db, "advances")));
  await assert.rejects(() =>
    updateDoc(doc(artist.db, "users", artistUser.uid), { balance: 999999 })
  );
});
