/**
 * The approval flow, both sides, against the Auth + Firestore + Functions
 * emulators.
 *
 * A stranger signs in from the Play Store, fills in a registration, waits;
 * an admin approves, and the stranger's own session unlocks without signing
 * out. Then the other two doors: revoke puts them back in the queue, decline
 * destroys the account.
 *
 *   npm run test:approval
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
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  collection,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const OWNER_EMAIL = "owner@kahiniscope.example";
const REGION = "asia-south1";

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

let owner;
let ownerUser;

before(async () => {
  owner = client("approval-owner");
  ownerUser = await signIn(owner, { sub: "owner", email: OWNER_EMAIL, name: "Kahiniscope" });
  await waitForClaims(ownerUser, (c) => c.role === "owner", "owner claims");

  // Something an approved account may read and a pending one may not.
  await setDoc(doc(owner.db, "episodes", "ep41"), {
    code: "EP-41",
    title: "রক্তমুখী নীলা",
    airDate: Timestamp.now(),
    status: "production",
  });
});

after(async () => {
  for (const app of apps) await deleteApp(app).catch(() => {});
});

test("a registration goes into the queue with the applicant's own words", async () => {
  const c = client("applicant-registering");
  const user = await signIn(c, { sub: "applicant-1", email: "shuvo@gmail.com", name: "Shuvo Karim" });
  await waitForClaims(user, (claims) => claims.status === "pending", "pending claims");

  // The one write a pending account may make.
  await updateDoc(doc(c.db, "users", user.uid), {
    craft: "Editing",
    phone: "+8801712344192",
    note: "Worked on EP-33 to EP-36 editing with Tanmoy.",
  });

  // The admin sees it, with everything the card needs on it.
  const queue = await getDocs(collection(owner.db, "users"));
  const applicant = queue.docs.find((d) => d.id === user.uid);
  assert.ok(applicant, "the applicant is in the queue");
  assert.equal(applicant.data().status, "pending");
  assert.equal(applicant.data().craft, "Editing");
  assert.equal(applicant.data().name, "Shuvo Karim");
  assert.match(applicant.data().note, /EP-33/);

  // And is refused everything else meanwhile.
  await assert.rejects(() => getDoc(doc(c.db, "episodes", "ep41")), /permission|PERMISSION/);
});

test("approving unlocks that session — no sign-out, no second visit", async () => {
  const c = client("applicant-approved");
  const user = await signIn(c, { sub: "applicant-2", email: "mahi@gmail.com", name: "Mahi Chowdhury" });
  await waitForClaims(user, (claims) => claims.status === "pending", "pending claims");
  await updateDoc(doc(c.db, "users", user.uid), { craft: "Voice", phone: "+8801919997730" });

  // What the Approve button does: one field.
  await updateDoc(doc(owner.db, "users", user.uid), { status: "approved" });

  const claims = await waitForClaims(user, (cl) => cl.status === "approved", "approval");
  assert.equal(claims.role, "member");

  const episode = await getDoc(doc(c.db, "episodes", "ep41"));
  assert.equal(episode.data().code, "EP-41");
});

test("revoking puts them back in the queue and closes the door again", async () => {
  const c = client("applicant-revoked");
  const user = await signIn(c, { sub: "applicant-3", email: "rupa@gmail.com", name: "Rupa Dutta" });
  await waitForClaims(user, (cl) => cl.status === "pending", "pending claims");

  await updateDoc(doc(owner.db, "users", user.uid), { status: "approved" });
  await waitForClaims(user, (cl) => cl.status === "approved", "approval");
  await assert.doesNotReject(() => getDoc(doc(c.db, "episodes", "ep41")));

  // Revoke. Not a deletion: the account and its history survive.
  await updateDoc(doc(owner.db, "users", user.uid), { status: "pending" });
  await waitForClaims(user, (cl) => cl.status === "pending", "revocation");

  const stillThere = await getDoc(doc(owner.db, "users", user.uid));
  assert.equal(stillThere.exists(), true);
  assert.equal(stillThere.data().status, "pending");

  await assert.rejects(() => getDoc(doc(c.db, "episodes", "ep41")), /permission|PERMISSION/);
});

test("declining deletes the document and the account", async () => {
  const c = client("applicant-declined");
  const user = await signIn(c, { sub: "applicant-4", email: "nope@gmail.com", name: "Not Suitable" });
  await waitForClaims(user, (cl) => cl.status === "pending", "pending claims");

  const decline = httpsCallable(owner.functions, "declineRegistration");
  const result = await decline({ uid: user.uid });
  assert.equal(result.data.name, "Not Suitable");

  const gone = await getDoc(doc(owner.db, "users", user.uid));
  assert.equal(gone.exists(), false);
});

test("a member cannot decline anybody", async () => {
  const c = client("applicant-attacker");
  const attacker = await signIn(c, { sub: "attacker", email: "attacker@gmail.com", name: "Attacker" });
  await waitForClaims(attacker, (cl) => cl.status === "pending", "pending claims");

  const victim = client("applicant-victim");
  const victimUser = await signIn(victim, { sub: "victim", email: "victim@gmail.com", name: "Victim" });
  await waitForClaims(victimUser, (cl) => cl.status === "pending", "pending claims");

  const decline = httpsCallable(c.functions, "declineRegistration");
  await assert.rejects(() => decline({ uid: victimUser.uid }), /permission-denied|Only an admin/);

  // Still there.
  const stillThere = await getDoc(doc(owner.db, "users", victimUser.uid));
  assert.equal(stillThere.exists(), true);
});

test("an approved account is revoked, never declined", async () => {
  const c = client("applicant-approved-then-declined");
  const user = await signIn(c, { sub: "applicant-5", email: "piyali@gmail.com", name: "Piyali Sen" });
  await waitForClaims(user, (cl) => cl.status === "pending", "pending claims");
  await updateDoc(doc(owner.db, "users", user.uid), { status: "approved" });
  await waitForClaims(user, (cl) => cl.status === "approved", "approval");

  const decline = httpsCallable(owner.functions, "declineRegistration");
  await assert.rejects(() => decline({ uid: user.uid }), /failed-precondition|Revoke it instead/);

  const stillThere = await getDoc(doc(owner.db, "users", user.uid));
  assert.equal(stillThere.exists(), true, "an approved account is not destroyed by a stray tap");
});

test("an approved member sees only their own work, and can close it", async () => {
  const c = client("member-dashboard");
  const user = await signIn(c, { sub: "member-1", email: "rizu@gmail.com", name: "Rizu Ahmed" });
  await waitForClaims(user, (cl) => cl.status === "pending", "pending claims");
  await updateDoc(doc(owner.db, "users", user.uid), { status: "approved", craft: "Voice" });
  await waitForClaims(user, (cl) => cl.status === "approved", "approval");

  // Two tasks: one theirs, one somebody else's.
  const mine = await addDoc(collection(owner.db, "tasks"), {
    episodeId: doc(owner.db, "episodes", "ep41"),
    assigneeUid: user.uid,
    type: "Voice recording",
    dueDate: Timestamp.now(),
    done: false,
    doneAt: null,
    remindersSent: 3,
    lastReminderAt: null,
    assignedAt: serverTimestamp(),
    preferredChannel: null,
  });
  const theirs = await addDoc(collection(owner.db, "tasks"), {
    episodeId: doc(owner.db, "episodes", "ep41"),
    assigneeUid: "somebody-else",
    type: "Editing",
    dueDate: Timestamp.now(),
    done: false,
    doneAt: null,
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: serverTimestamp(),
    preferredChannel: null,
  });

  // The exact query the member dashboard runs.
  const own = await getDocs(
    query(collection(c.db, "tasks"), where("assigneeUid", "==", user.uid))
  );
  assert.deepEqual(own.docs.map((d) => d.id), [mine.id]);

  // The episode title the card shows.
  const episode = await getDoc(doc(c.db, "episodes", "ep41"));
  assert.equal(episode.data().title, "রক্তমুখী নীলা");

  // Mark done — the one write they have.
  await assert.doesNotReject(() =>
    updateDoc(doc(c.db, "tasks", mine.id), { done: true, doneAt: Timestamp.now() })
  );
  const closed = await getDoc(doc(owner.db, "tasks", mine.id));
  assert.equal(closed.data().done, true, "the admin's board sees it closed");

  // And nothing else.
  await assert.rejects(() => getDoc(doc(c.db, "tasks", theirs.id)), /permission|PERMISSION/);
  await assert.rejects(
    () => updateDoc(doc(c.db, "tasks", mine.id), { remindersSent: 0 }),
    /permission|PERMISSION/
  );
  await assert.rejects(() => getDocs(collection(c.db, "tasks")), /permission|PERMISSION/);
});
