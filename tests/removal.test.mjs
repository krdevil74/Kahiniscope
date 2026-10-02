/**
 * Deleting a task and deleting an episode, against the Auth + Firestore +
 * Functions emulators.
 *
 * The parts worth proving are the ones no unit test can reach: that the whole
 * tree under an episode goes rather than being orphaned, that work which has
 * been paid for cannot be deleted by either door, and that a member cannot
 * delete anything at all.
 *
 *   npm run test:removal
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
  deleteDoc,
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
let episodeSeq = 0;

/** An episode with its script link, as the app writes one. */
async function newEpisode() {
  const id = `ep-del-${(episodeSeq += 1)}`;
  await setDoc(doc(owner.db, "episodes", id), {
    code: `EP-${90 + episodeSeq}`,
    title: "মুছে ফেলার গল্প",
    airDate: Timestamp.now(),
    status: "in_progress",
  });
  await setDoc(doc(owner.db, "episodes", id, "private", "script"), {
    url: "https://drive.google.com/file/d/abc/view",
    addedAt: serverTimestamp(),
    addedBy: "owner",
  });
  return id;
}

/**
 * A task as the Assign form writes one — `episodeId` a DocumentReference,
 * which is the shape a query on a string does not match.
 */
async function newTask(episodeId, overrides = {}) {
  const created = await addDoc(collection(owner.db, "tasks"), {
    episodeId: doc(owner.db, "episodes", episodeId),
    assigneeUid: artistUser.uid,
    type: "Voice recording",
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
    ...overrides,
  });
  return created.id;
}

/** Approve it, which is what opens a payment against it. */
async function accept(taskId) {
  await updateDoc(doc(artist.db, "tasks", taskId), {
    status: "submitted",
    submittedAt: Timestamp.now(),
  });
  const { data } = await call(owner, "reviewTask", {
    taskId,
    decision: "approve",
    unit: "voice-character",
    recordingMinutes: 5,
  });
  return data.paymentId;
}

const exists = async (path, id) => (await getDoc(doc(owner.db, path, id))).exists();

before(async () => {
  owner = client("del-owner");
  const ownerUser = await signIn(owner, { sub: "owner", email: OWNER_EMAIL, name: "Kahiniscope" });
  await waitForClaims(ownerUser, (c) => c.role === "owner", "owner claims");

  artist = client("del-artist");
  artistUser = await signIn(artist, { sub: "artist", email: "artist@gmail.com", name: "Rizu Ahmed" });
  await waitForClaims(artistUser, (c) => c.status === "pending", "pending claims");
  await updateDoc(doc(artist.db, "users", artistUser.uid), {
    phone: "+919876500011",
    crafts: ["Voice"],
  });
  await updateDoc(doc(owner.db, "users", artistUser.uid), {
    status: "approved",
    rates: { voiceCharacter: 50, voiceNarration: 35, soundDesign: null, cover: null },
  });
  await waitForClaims(artistUser, (c) => c.status === "approved", "approved claims");
});

after(async () => {
  for (const app of apps) await deleteApp(app).catch(() => {});
});

// ---------------------------------------------------------------------------
// A task
// ---------------------------------------------------------------------------

test("a task assigned by mistake can be deleted", async () => {
  const episodeId = await newEpisode();
  const taskId = await newTask(episodeId);

  const { data } = await call(owner, "deleteTask", { taskId });
  assert.equal(data.type, "Voice recording", "the toast names what went");
  assert.equal(await exists("tasks", taskId), false);
});

test("work that has been accepted cannot be deleted, because a payment names it", async () => {
  const episodeId = await newEpisode();
  const taskId = await newTask(episodeId);
  const paymentId = await accept(taskId);

  await assert.rejects(
    () => call(owner, "deleteTask", { taskId }),
    /accepted|payment/i,
    "a payment pointing at nothing is money owed for a job not in the database"
  );

  // Both still there, which is the whole point.
  assert.equal(await exists("tasks", taskId), true);
  assert.equal(await exists("payments", paymentId), true);
});

test("handed in but not yet reviewed is still deletable", async () => {
  // Nothing has been approved, so no payment exists to orphan.
  const episodeId = await newEpisode();
  const taskId = await newTask(episodeId);
  await updateDoc(doc(artist.db, "tasks", taskId), {
    status: "submitted",
    submittedAt: Timestamp.now(),
  });

  await call(owner, "deleteTask", { taskId });
  assert.equal(await exists("tasks", taskId), false);
});

test("a member deletes nothing, by either door", async () => {
  const episodeId = await newEpisode();
  const taskId = await newTask(episodeId);

  await assert.rejects(() => call(artist, "deleteTask", { taskId }), /admin/);
  await assert.rejects(() => call(artist, "deleteEpisode", { episodeId }), /admin/);
  // Nor straight at the documents: the rules refuse that for everybody now.
  await assert.rejects(() => deleteDoc(doc(artist.db, "tasks", taskId)));
  await assert.rejects(() => deleteDoc(doc(artist.db, "episodes", episodeId)));
  assert.equal(await exists("tasks", taskId), true);
});

test("deleting a task that is already gone says so rather than pretending", async () => {
  await assert.rejects(() => call(owner, "deleteTask", { taskId: "no-such-task" }), /gone/);
  await assert.rejects(() => call(owner, "deleteTask", {}), /required/);
});

// ---------------------------------------------------------------------------
// An episode
// ---------------------------------------------------------------------------

test("deleting an episode takes its tasks and its script with it", async () => {
  const episodeId = await newEpisode();
  const first = await newTask(episodeId);
  // The other shape of episodeId, which a query on a reference does not match.
  const second = await newTask(episodeId, { episodeId });

  const { data } = await call(owner, "deleteEpisode", { episodeId });
  assert.equal(data.tasks, 2, "both shapes of the field were found");

  assert.equal(await exists("episodes", episodeId), false);
  assert.equal(await exists("tasks", first), false);
  assert.equal(await exists("tasks", second), false);

  // Firestore does not cascade, so this is the one that would have been left
  // behind: reachable, invisible, and belonging to nothing.
  const script = await getDoc(doc(owner.db, "episodes", episodeId, "private", "script"));
  assert.equal(script.exists(), false, "the script link went with it");
});

test("an episode with accepted work is refused, and nothing on it is touched", async () => {
  const episodeId = await newEpisode();
  const open = await newTask(episodeId);
  const accepted = await newTask(episodeId);
  const paymentId = await accept(accepted);

  await assert.rejects(
    () => call(owner, "deleteEpisode", { episodeId }),
    /approved|accepted|broadcast/i
  );

  // Refused means refused: the open task is still there too, not half-deleted.
  assert.equal(await exists("episodes", episodeId), true);
  assert.equal(await exists("tasks", open), true);
  assert.equal(await exists("tasks", accepted), true);
  assert.equal(await exists("payments", paymentId), true);
});

test("an episode nobody has worked on goes cleanly", async () => {
  const episodeId = await newEpisode();
  const { data } = await call(owner, "deleteEpisode", { episodeId });
  assert.equal(data.tasks, 0);
  assert.equal(await exists("episodes", episodeId), false);
});

test("the roster goes too, rather than outliving the episode", async () => {
  const episodeId = await newEpisode();
  const taskId = await newTask(episodeId);

  // The tasks trigger writes the roster the script rule reads. Wait for it,
  // because what is being tested is that it does not outlive the episode.
  const roster = doc(owner.db, "episodes", episodeId, "private", "roster");
  for (let tries = 0; tries < 25; tries += 1) {
    if ((await getDoc(roster)).exists()) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal((await getDoc(roster)).exists(), true, "the trigger wrote a roster");

  await call(owner, "deleteEpisode", { episodeId });
  assert.equal(await exists("tasks", taskId), false);

  // Either the function took it or the trigger did when the last task went.
  for (let tries = 0; tries < 25; tries += 1) {
    if (!(await getDoc(roster)).exists()) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal((await getDoc(roster)).exists(), false, "no roster for an episode that is gone");
});

test("deleting an episode that is already gone says so", async () => {
  await assert.rejects(() => call(owner, "deleteEpisode", { episodeId: "no-such-episode" }), /gone/);
  await assert.rejects(() => call(owner, "deleteEpisode", {}), /required/);
});
