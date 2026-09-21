/**
 * People an admin adds by hand, against the Auth + Firestore + Functions
 * emulators.
 *
 * The three things worth proving, because none of them can be proved by a
 * unit test: a contact is created by a Cloud Function and nobody else can
 * make one; a phone number belongs to exactly one person; and when that
 * person finally installs the app, their work moves onto the real account
 * rather than stranding on a record nothing can sign into.
 *
 *   npm run test:contacts
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
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const OWNER_EMAIL = "owner@kahiniscope.test";
const REGION = "asia-south2";
const NUMBER = "+919876543210";

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

before(async () => {
  owner = client("contacts-owner");
  const user = await signIn(owner, { sub: "owner", email: OWNER_EMAIL, name: "Kahiniscope" });
  await waitForClaims(user, (c) => c.role === "owner", "owner claims");

  await setDoc(doc(owner.db, "episodes", "ep51"), {
    code: "EP-51",
    title: "রক্তমুখী নীলা",
    airDate: Timestamp.now(),
    status: "production",
  });
});

after(async () => {
  for (const app of apps) await deleteApp(app).catch(() => {});
});

test("an admin adds somebody who has no app, and they are assignable at once", async () => {
  const { data } = await call(owner, "addContact", {
    name: "Nabanita Roy",
    // Typed the local way: the server decides what a number is.
    phone: "9876500002",
    crafts: ["Translation", "Proofreading"],
    preferredChannel: "whatsapp",
  });

  const snap = await getDoc(doc(owner.db, "users", data.uid));
  assert.equal(snap.data().phone, "+919876500002", "normalised to E.164 on the server");
  assert.equal(snap.data().accountless, true);
  assert.equal(snap.data().status, "approved", "an admin typing them in is the approval");
  assert.deepEqual(snap.data().crafts, ["Translation", "Proofreading"]);

  // Assignable like anybody else — the board and the ladder cannot tell.
  const task = await addDoc(collection(owner.db, "tasks"), {
    episodeId: "ep51",
    assigneeUid: data.uid,
    type: "Translation",
    dueDate: Timestamp.now(),
    done: false,
    remindersSent: 0,
    assignedAt: Timestamp.now(),
  });
  assert.ok(task.id);
});

test("one number, one person", async () => {
  await call(owner, "addContact", {
    name: "First Claim",
    phone: NUMBER,
    crafts: ["Voice"],
  });

  await assert.rejects(
    () => call(owner, "addContact", { name: "Second Claim", phone: NUMBER, crafts: ["Voice"] }),
    /already on the team/
  );
});

test("a number that is not a number is refused", async () => {
  await assert.rejects(
    () => call(owner, "addContact", { name: "Nobody", phone: "0171", crafts: ["Voice"] }),
    /phone number/
  );
});

test("a member cannot invent people", async () => {
  const c = client("contacts-member");
  const user = await signIn(c, { sub: "member-x", email: "member-x@gmail.com", name: "Member X" });
  await waitForClaims(user, (claims) => claims.status === "pending", "pending claims");

  await assert.rejects(
    () => call(c, "addContact", { name: "Ghost", phone: "+8801900000001", crafts: ["Voice"] }),
    /admin/
  );

  // And not by writing the document directly either — the rules forbid it.
  await assert.rejects(() =>
    setDoc(doc(c.db, "users", "ghost"), { name: "Ghost", status: "approved", role: "member" })
  );
});

test("when they install the app, their work moves onto the real account", async () => {
  // An admin has been tracking Tanmoy by phone for weeks.
  const { data: contact } = await call(owner, "addContact", {
    name: "Tanmoy Das",
    phone: "+919876500004",
    crafts: ["Post / mix"],
    preferredChannel: "telegram",
  });

  const task = await addDoc(collection(owner.db, "tasks"), {
    episodeId: "ep51",
    assigneeUid: contact.uid,
    type: "Dubbing / mixing",
    dueDate: Timestamp.now(),
    done: false,
    remindersSent: 2,
    assignedAt: Timestamp.now(),
  });

  // Tanmoy finally signs in, and registers with the number the admin used.
  const c = client("contacts-tanmoy");
  const user = await signIn(c, { sub: "tanmoy", email: "tanmoy@gmail.com", name: "Tanmoy Das" });
  await waitForClaims(user, (claims) => claims.status === "pending", "pending claims");
  await updateDoc(doc(c.db, "users", user.uid), {
    phone: "+919876500004",
    crafts: ["Editing"],
    note: "Same Tanmoy.",
  });

  await call(owner, "approveAndLinkContact", { uid: user.uid, contactUid: contact.uid });

  // The task followed him.
  const moved = await getDoc(doc(owner.db, "tasks", task.id));
  assert.equal(moved.data().assigneeUid, user.uid);
  assert.equal(moved.data().remindersSent, 2, "the ladder's position is not reset by a merge");

  // One record, carrying both sets of crafts.
  const account = await getDoc(doc(owner.db, "users", user.uid));
  assert.equal(account.data().status, "approved");
  assert.deepEqual([...account.data().crafts].sort(), ["Editing", "Post / mix"]);

  const gone = await getDoc(doc(owner.db, "users", contact.uid));
  assert.equal(gone.exists(), false, "the contact record is not left behind");

  // And his own session unlocks, as it would on any approval.
  await waitForClaims(user, (claims) => claims.status === "approved", "approved claims");
});

test("two real accounts are never merged, whatever is passed in", async () => {
  const c = client("contacts-other");
  const user = await signIn(c, { sub: "other", email: "other@gmail.com", name: "Other Person" });
  await waitForClaims(user, (claims) => claims.status === "pending", "pending claims");

  const owners = await getDocs(
    query(collection(owner.db, "users"), where("email", "==", OWNER_EMAIL))
  );
  assert.equal(owners.size, 1);

  await assert.rejects(
    () => call(owner, "approveAndLinkContact", { uid: user.uid, contactUid: owners.docs[0].id }),
    /not a contact/
  );
});

test("a merge is refused once the two no longer share a number", async () => {
  const { data: contact } = await call(owner, "addContact", {
    name: "Moving Target",
    phone: "+8801911111111",
    crafts: ["Voice"],
  });

  const c = client("contacts-mismatch");
  const user = await signIn(c, { sub: "mismatch", email: "mismatch@gmail.com", name: "Mismatch" });
  await waitForClaims(user, (claims) => claims.status === "pending", "pending claims");
  await updateDoc(doc(c.db, "users", user.uid), { phone: "+8801922222222", crafts: ["Voice"] });

  await assert.rejects(
    () => call(owner, "approveAndLinkContact", { uid: user.uid, contactUid: contact.uid }),
    /phone number/
  );
});
