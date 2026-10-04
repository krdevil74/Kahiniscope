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
  count,
  getAggregateFromServer,
  sum,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

// The proof sweep is a scheduled job rather than a callable, so it is run here
// directly — a job whose whole purpose is deleting data should be run by a test
// rather than trusted. Importing the functions bundle is what initialises the
// Admin app it uses, exactly as it does in production; everything it touches is
// this emulator, because emulators:exec has set FIRESTORE_EMULATOR_HOST.
import "../functions/lib/index.js";
import { PROOF_TTL_DAYS, runProofSweep } from "../functions/lib/payment-proof.js";

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
let ownerUid;
let artist;
let artistUser;

async function newTask(type = "Voice recording", assigneeUid = null) {
  const created = await addDoc(collection(owner.db, "tasks"), {
    episodeId: doc(owner.db, "episodes", "ep61"),
    assigneeUid: assigneeUid ?? artistUser.uid,
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
  ownerUid = ownerUser.uid;

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
  // An id, not the DocumentReference the task carries. Both sides of the app
  // look the episode up by id, so a reference here is what made every payment
  // row read "No episode".
  assert.equal(payment.episodeId, "ep61");
  assert.equal(typeof payment.episodeId, "string");
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

// ---------------------------------------------------------------------------
// What the admin's Payments screen actually asks for
//
// It used to subscribe to this whole collection and add it up on the phone,
// which got slower every month the operation ran. These are the three bounded
// questions that replaced it.
// ---------------------------------------------------------------------------

/** The half-open range the app asks a month for, on the device's own clock. */
function monthRange(date) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  };
}

const paidBetween = (db, start, end) =>
  query(
    collection(db, "payments"),
    where("status", "==", "paid"),
    where("paidAt", ">=", Timestamp.fromDate(start)),
    where("paidAt", "<", Timestamp.fromDate(end))
  );

test("a month bar is a sum and a count, not a download", async () => {
  // `payments` is unwritable by every client, admin included, so a payment
  // cannot be backdated from here — these land in the month the emulator is
  // running in, and the assertion is what the bar changes by.
  const { start, end } = monthRange(new Date());
  const totals = async () =>
    (
      await getAggregateFromServer(paidBetween(owner.db, start, end), {
        total: sum("finalAmount"),
        count: count(),
      })
    ).data();

  const before = await totals();
  await paidPayment(300);
  await paidPayment(450);
  const after = await totals();

  assert.equal(after.count - before.count, 2, "two more payments in this month");
  assert.equal(after.total - before.total, 750, "and ₹750 more, added by Firestore");
});

/**
 * The ceiling on the read the chart falls back to. The app's own constant is
 * `WINDOW_READ_LIMIT` in mobile/src/lib/data.ts; this is the same number, and
 * what matters here is the ordering under it.
 */
const WINDOW_READ_LIMIT = 500;

test("the months can be read from documents when the aggregation will not total them", async () => {
  // Twelve aggregations fired at once, with one rejection discarding all
  // twelve, is how the admin's chart came to say "No payments yet" about a
  // week in which six people had been paid. There is a bounded read behind
  // the bars now, and the two have to agree about the same month or the
  // fallback is worse than the failure.
  const { start, end } = monthRange(new Date());
  await paidPayment(310);
  await paidPayment(640);

  const added = (
    await getAggregateFromServer(paidBetween(owner.db, start, end), {
      total: sum("finalAmount"),
      count: count(),
    })
  ).data();

  const read = await getDocs(
    query(paidBetween(owner.db, start, end), orderBy("paidAt", "desc"), limit(WINDOW_READ_LIMIT))
  );
  const onThePhone = read.docs.reduce((sum, d) => sum + Number(d.data().finalAmount ?? 0), 0);

  assert.equal(read.size, added.count, "the same payments the index counted");
  assert.equal(onThePhone, added.total, "and the same rupees, added up here instead");

  // Newest first, so a month that ever does reach the ceiling loses its
  // oldest payments rather than an arbitrary handful — which is what lets the
  // screen say the oldest months in view may be short.
  const times = read.docs.map((d) => d.data().paidAt.toMillis());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});

test("a month nothing was paid in counts nothing", async () => {
  // The bar for last month must not pick up this month's work — the ranges
  // are half-open, so no payment is in two months and none is in neither.
  const previous = monthRange(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const before = (
    await getAggregateFromServer(paidBetween(owner.db, previous.start, previous.end), {
      total: sum("finalAmount"),
      count: count(),
    })
  ).data();

  await paidPayment(500);

  const after = (
    await getAggregateFromServer(paidBetween(owner.db, previous.start, previous.end), {
      total: sum("finalAmount"),
      count: count(),
    })
  ).data();
  assert.equal(after.count, before.count, "last month did not move");
  assert.equal(after.total, before.total);
});

test("opening one month reads that month and nothing else", async () => {
  const paymentId = await paidPayment(425);
  const now = new Date();

  const thisMonth = await getDocs(
    query(paidBetween(owner.db, monthRange(now).start, monthRange(now).end), orderBy("paidAt", "desc"))
  );
  assert.ok(
    thisMonth.docs.some((d) => d.id === paymentId),
    "the payment just made is in this month"
  );
  assert.ok(
    thisMonth.docs.every((d) => d.data().status === "paid"),
    "and nothing still waiting is in the list"
  );

  // Every document the query returned falls inside the month it asked for:
  // that is what keeps opening one month from loading the collection.
  const { start, end } = monthRange(now);
  for (const d of thisMonth.docs) {
    const at = d.data().paidAt.toDate();
    assert.ok(at >= start && at < end, `${d.id} paid at ${at.toISOString()} is outside the month`);
  }

  const lastMonth = monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const before = await getDocs(paidBetween(owner.db, lastMonth.start, lastMonth.end));
  assert.equal(
    before.docs.some((d) => d.id === paymentId),
    false,
    "and it is not in the month before"
  );
});

test("the pending queue is a query, so paying something removes it from the screen", async () => {
  const before = await getDocs(
    query(collection(owner.db, "payments"), where("status", "==", "pending"))
  );

  const taskId = await newTask();
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });
  const { data } = await call(owner, "reviewTask", {
    taskId,
    decision: "approve",
    unit: "voice-character",
    recordingMinutes: 3,
  });

  const waiting = await getDocs(
    query(collection(owner.db, "payments"), where("status", "==", "pending"))
  );
  assert.equal(waiting.size, before.size + 1, "approving adds one to the queue");

  await call(owner, "markPaymentPaid", { paymentId: data.paymentId, amount: 195 });

  const after = await getDocs(
    query(collection(owner.db, "payments"), where("status", "==", "pending"))
  );
  assert.equal(after.size, before.size, "paying takes it out again, for good");
  // And it is now countable in its month instead.
  assert.equal((await read("payments", data.paymentId)).status, "paid");
});

test("a member cannot run the admin's totals across everybody", async () => {
  // The aggregation is subject to the same rules as the documents: a query
  // that does not name the member is refused before it counts anything.
  await assert.rejects(() =>
    getAggregateFromServer(
      query(collection(artist.db, "payments"), where("status", "==", "paid")),
      { total: sum("finalAmount") }
    )
  );

  // Their own still works, which is what their Payments screen asks for.
  const mine = await getAggregateFromServer(
    query(collection(artist.db, "payments"), where("uid", "==", artistUser.uid)),
    { count: count() }
  );
  assert.ok(mine.data().count > 0);
});

// ---------------------------------------------------------------------------
// The screenshot that proves the money went out
//
// Its own collection, keyed by the payment id, deleted after thirty days. The
// payment keeps two dates so no screen has to load an image to decide whether
// to offer the download.
// ---------------------------------------------------------------------------

/** A one-pixel JPEG is enough: what is under test is the plumbing, not the image. */
const PIXEL =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAA" +
  "AAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/E" +
  "ABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJQA/9k=";

async function paidPayment(amount = 200) {
  const taskId = await newTask();
  await updateDoc(doc(artist.db, "tasks", taskId), { status: "submitted", submittedAt: Timestamp.now() });
  const { data } = await call(owner, "reviewTask", {
    taskId,
    decision: "approve",
    unit: "voice-character",
    recordingMinutes: 4,
  });
  await call(owner, "markPaymentPaid", { paymentId: data.paymentId, amount });
  return data.paymentId;
}

test("a screenshot lands in its own collection, and the payment only points at it", async () => {
  const paymentId = await paidPayment();

  const { data } = await call(owner, "attachPaymentProof", {
    paymentId,
    data: PIXEL,
    contentType: "image/jpeg",
  });
  assert.ok(data.byteSize > 0);

  const proof = await read("paymentProofs", paymentId);
  assert.equal(proof.paymentId, paymentId);
  assert.equal(proof.uid, artistUser.uid, "copied on, so the rule need not get() the payment");
  assert.equal(proof.data, PIXEL);
  assert.equal(proof.contentType, "image/jpeg");

  // Thirty days, off the server's clock rather than a phone's.
  const days = (proof.expiresAt.toDate() - proof.uploadedAt.toDate()) / 86_400_000;
  assert.ok(Math.abs(days - 30) < 0.01, `expected 30 days, got ${days}`);

  // The payment carries the dates and none of the bytes: every total on both
  // sides of the app loads these documents.
  const payment = await read("payments", paymentId);
  assert.ok(payment.proofAttachedAt, "there is a screenshot");
  assert.equal(
    payment.proofExpiresAt.toMillis(),
    proof.expiresAt.toMillis(),
    "the app decides from the payment alone whether to offer the download"
  );
  assert.equal(payment.data, undefined);
  assert.equal(JSON.stringify(payment).includes(PIXEL.slice(0, 40)), false);
});

test("replacing a screenshot overwrites it and restarts the thirty days", async () => {
  const paymentId = await paidPayment();
  await call(owner, "attachPaymentProof", { paymentId, data: PIXEL, contentType: "image/jpeg" });
  const first = await read("paymentProofs", paymentId);

  await call(owner, "attachPaymentProof", { paymentId, data: "AAAA", contentType: "image/png" });
  const second = await read("paymentProofs", paymentId);

  // One screenshot per payment, the way there is one amount. No history.
  assert.equal(second.data, "AAAA");
  assert.equal(second.contentType, "image/png");
  assert.ok(second.expiresAt.toMillis() >= first.expiresAt.toMillis());
});

test("a member cannot attach evidence about their own payment", async () => {
  const paymentId = await paidPayment();
  await assert.rejects(
    () => call(artist, "attachPaymentProof", { paymentId, data: PIXEL, contentType: "image/jpeg" }),
    /admin/
  );
  // Nor write the document the callable would have written.
  await assert.rejects(() =>
    setDoc(doc(artist.db, "paymentProofs", paymentId), { uid: artistUser.uid, data: PIXEL })
  );
});

test("a member reads their own screenshot and nobody else's", async () => {
  const paymentId = await paidPayment();
  await call(owner, "attachPaymentProof", { paymentId, data: PIXEL, contentType: "image/jpeg" });

  const mine = await getDoc(doc(artist.db, "paymentProofs", paymentId));
  assert.equal(mine.data().data, PIXEL, "this is the evidence they were paid");

  // The collection is not theirs to sweep up.
  await assert.rejects(() => getDocs(collection(artist.db, "paymentProofs")));
});

test("junk is refused before it reaches a document", async () => {
  const paymentId = await paidPayment();

  // A data: prefix the app should have stripped — it would render as a broken
  // image on the other side.
  await assert.rejects(
    () =>
      call(owner, "attachPaymentProof", {
        paymentId,
        data: `data:image/png;base64,${PIXEL}`,
        contentType: "image/png",
      }),
    /did not arrive in one piece/
  );

  await assert.rejects(
    () => call(owner, "attachPaymentProof", { paymentId, data: PIXEL, contentType: "application/pdf" }),
    /JPEG, PNG or WebP/
  );

  // Over the cap. Refused here rather than failing on the way into Firestore,
  // so the admin gets a sentence instead of an internal error.
  await assert.rejects(
    () =>
      call(owner, "attachPaymentProof", {
        paymentId,
        data: "A".repeat(700_004),
        contentType: "image/jpeg",
      }),
    /too large/
  );

  await assert.rejects(
    () => call(owner, "attachPaymentProof", { paymentId: "nope", data: PIXEL, contentType: "image/jpeg" }),
    /gone/
  );
});

test("the sweep deletes the image and leaves the payment alone", async () => {
  const paymentId = await paidPayment();
  await call(owner, "attachPaymentProof", { paymentId, data: PIXEL, contentType: "image/jpeg" });

  // Nothing has expired yet, so a sweep today must not touch it. A job that
  // deletes a document a day early is worse than one that runs a day late.
  assert.deepEqual(await runProofSweep(new Date()), { deleted: 0 });
  assert.ok((await read("paymentProofs", paymentId)).data, "still there");

  // Run it with a clock a day past the thirty days, which is the only honest
  // way to test a deletion job — the same trick the retention sweep uses.
  const later = new Date(Date.now() + (PROOF_TTL_DAYS + 1) * 86_400_000);
  // Every screenshot this suite attached is a month old by that clock, so the
  // count is "at least this one" rather than exactly one.
  const swept = await runProofSweep(later);
  assert.ok(swept.deleted >= 1, `nothing was swept (${swept.deleted})`);

  // The image is gone.
  assert.equal((await getDoc(doc(owner.db, "paymentProofs", paymentId))).exists(), false);

  // The payment is not. This is the whole point of keeping the two apart: what
  // was paid, when, and how it was worked out all survive the screenshot.
  const payment = await read("payments", paymentId);
  assert.equal(payment.status, "paid");
  assert.equal(payment.finalAmount, 200);
  assert.equal(payment.quantity, 4);
  // And the payment still records that there was a screenshot, with the date it
  // stopped being available. The sweep deliberately does not write here: an
  // expiry in the past is what both sides of the app already read as "gone",
  // and clearing it would cost a write to say the same thing.
  assert.ok(payment.proofAttachedAt, "it still records that there was one");
  assert.ok(payment.proofExpiresAt.toMillis() < later.getTime());
});

// ---------------------------------------------------------------------------
// An admin's own work
//
// The admin has no Submit button — /my-tasks sends them to the board — so a
// task of their own is accepted straight from `open`. It was closing with no
// payment behind it, which is money quietly not owed to anybody.
// ---------------------------------------------------------------------------

test("an admin's own work is accepted without being handed in, and still opens a payment", async () => {
  // A rate card for the admin, the same as anybody else's.
  await updateDoc(doc(owner.db, "users", ownerUid), {
    rates: { voiceCharacter: null, voiceNarration: null, soundDesign: null, cover: 500 },
  });
  const taskId = await newTask("Thumbnail / graphics", ownerUid);
  assert.equal((await read("tasks", taskId)).status, "open", "never handed in");

  const { data } = await call(owner, "reviewTask", { taskId, decision: "approve", unit: "cover" });

  assert.equal(data.estimatedAmount, 500, "one cover at the admin's own rate");

  const task = await read("tasks", taskId);
  assert.equal(task.status, "approved");
  assert.equal(task.done, true);

  const payment = await read("payments", data.paymentId);
  assert.equal(payment.uid, ownerUid);
  assert.equal(payment.status, "pending");
  assert.equal(payment.rate, 500);
  assert.equal(payment.estimatedAmount, 500);
  assert.equal(payment.approvedBy, ownerUid, "they accepted their own work, and it says so");
});

test("their own recording opens a payment with no estimate, not no payment", async () => {
  // The tick on the episode screen has nowhere to ask for the minutes, so
  // there is nothing to multiply. The entry still has to exist: the figure is
  // typed on the Payments queue, which is where every figure is typed.
  await updateDoc(doc(owner.db, "users", ownerUid), {
    rates: { voiceCharacter: 60, voiceNarration: null, soundDesign: null, cover: 500 },
  });
  const taskId = await newTask("Voice recording", ownerUid);

  const { data } = await call(owner, "reviewTask", {
    taskId,
    decision: "approve",
    unit: "voice-character",
  });

  assert.equal(data.estimatedAmount, null, "no minutes, no arithmetic");
  const payment = await read("payments", data.paymentId);
  assert.equal(payment.status, "pending", "it is in the queue, waiting for a figure");
  assert.equal(payment.quantity, null);
  assert.equal(payment.rate, 60, "the rate is still snapshotted");
  assert.equal(payment.estimatedAmount, null);
  assert.equal(payment.finalAmount, null);
});

test("their own work cannot be accepted twice", async () => {
  const taskId = await newTask("Thumbnail / graphics", ownerUid);
  await call(owner, "reviewTask", { taskId, decision: "approve", unit: "cover" });

  // Two payments for one cover is the failure this guard exists for.
  await assert.rejects(
    () => call(owner, "reviewTask", { taskId, decision: "approve", unit: "cover" }),
    /not waiting for review/
  );
  const paid = await getDocs(
    query(collection(owner.db, "payments"), where("taskId", "==", taskId))
  );
  assert.equal(paid.size, 1);
});

test("a task closed by an older build is not a task waiting to be paid for", async () => {
  // `done` and nothing else: the shape every task had before any of this, and
  // the shape the old tick left behind. Approving it would pay a second time
  // for work somebody already signed off.
  const created = await addDoc(collection(owner.db, "tasks"), {
    episodeId: doc(owner.db, "episodes", "ep61"),
    assigneeUid: ownerUid,
    type: "Thumbnail / graphics",
    dueDate: Timestamp.now(),
    done: true,
    doneAt: Timestamp.now(),
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: serverTimestamp(),
    preferredChannel: null,
  });

  await assert.rejects(
    () => call(owner, "reviewTask", { taskId: created.id, decision: "approve", unit: "cover" }),
    /not waiting for review/
  );
});

test("sending your own work back to yourself is not a thing", async () => {
  // Rejecting still needs a submission. There is nothing to send back about
  // work nobody has offered, and the reminder clock it restarts is the
  // member's — an admin chasing themselves is noise.
  const taskId = await newTask("Thumbnail / graphics", ownerUid);
  await assert.rejects(
    () => call(owner, "reviewTask", { taskId, decision: "reject", note: "Not happy with it." }),
    /not waiting for review/
  );
});

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
