/**
 * Identity, end to end, against the Auth + Firestore + Functions emulators.
 *
 * This is the build-order step 1 acceptance test in its literal form: a
 * second Google account signs in, lands pending, and can read nothing. It
 * drives the real client SDK through the real blocking functions, so what it
 * proves is the deployed behaviour, not a mock of it.
 *
 *   npm run test:auth
 *
 * The Auth emulator accepts an unsigned JSON payload where a Google ID token
 * would go, which is how a verified — or deliberately unverified — Google
 * sign-in is simulated here.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  deleteUser,
  getAuth,
  getIdTokenResult,
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";

const OWNER_EMAIL = "owner@kahiniscope.test";

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
const projectId = process.env.GCLOUD_PROJECT ?? "kahiniscope-demo";

/** Each signed-in identity gets its own app, so sessions do not collide. */
function client(name) {
  const app = initializeApp({ apiKey: "fake-api-key", projectId }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  return { app, auth, db };
}

/** Sign in the way Google would, with the claims we choose. */
async function signInAsGoogle({ auth }, { sub, email, emailVerified = true, name }) {
  const payload = JSON.stringify({
    sub,
    email,
    email_verified: emailVerified,
    name: name ?? email,
  });
  const cred = await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(payload)
  );
  return cred.user;
}

/** Claims arrive via a background trigger; give them a moment to land. */
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

async function waitForDoc(db, path, predicate, label, timeoutMs = 20000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    const snap = await getDoc(doc(db, ...path));
    last = snap.exists() ? snap.data() : null;
    if (snap.exists() && predicate(snap.data())) return snap.data();
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.fail(`Timed out waiting for ${label}. Last document: ${JSON.stringify(last)}`);
}

const apps = [];
function openClient(name) {
  const c = client(name);
  apps.push(c.app);
  return c;
}

after(async () => {
  for (const app of apps) await deleteApp(app).catch(() => {});
});

// ---------------------------------------------------------------------------

test("an unverified owner address gets no privilege at all", async () => {
  const c = openClient("unverified-owner");
  const user = await signInAsGoogle(c, {
    sub: "uid-unverified-owner",
    email: OWNER_EMAIL,
    emailVerified: false,
    name: "Not really the owner",
  });

  const claims = await waitForClaims(
    user,
    (c) => c.role !== undefined,
    "claims on an unverified owner address"
  );
  assert.equal(claims.role, "member");
  assert.equal(claims.status, "pending");

  // Free the address for the real owner sign-in below.
  await deleteUser(user);
});

test("the owner address on a verified token becomes the owner", async () => {
  const c = openClient("owner");
  const user = await signInAsGoogle(c, {
    sub: "uid-real-owner",
    email: OWNER_EMAIL,
    name: "Kahiniscope",
  });

  const claims = await waitForClaims(
    user,
    (c) => c.role === "owner",
    "owner claims"
  );
  assert.equal(claims.status, "approved");

  const stored = await waitForDoc(
    c.db,
    ["users", user.uid],
    (d) => d.role === "owner",
    "the owner user document"
  );
  assert.equal(stored.email, OWNER_EMAIL);
  assert.equal(stored.status, "approved");
  assert.deepEqual(stored.fcmTokens, []);
});

test("a second Google account lands pending and can read nothing", async () => {
  const owner = openClient("owner-seeding");
  const ownerUser = await signInAsGoogle(owner, {
    sub: "uid-real-owner",
    email: OWNER_EMAIL,
    name: "Kahiniscope",
  });
  await waitForClaims(ownerUser, (c) => c.role === "owner", "owner claims");

  // Something for the newcomer to fail to read.
  await setDoc(doc(owner.db, "episodes", "ep41"), {
    code: "EP-41",
    title: "রক্তমুখী নীলা",
    airDate: Timestamp.now(),
    status: "production",
  });
  await setDoc(doc(owner.db, "settings", "global"), {
    plan: [7, 4, 3, 2, 1],
    quietHours: { enabled: true, from: 22, to: 8, sendQueuedAt: 9 },
    channels: { push: true, telegram: true, whatsapp: true, sms: false, email: false },
  });

  const c = openClient("newcomer");
  const user = await signInAsGoogle(c, {
    sub: "uid-newcomer",
    email: "rizu.ahmed@gmail.com",
    name: "Rizu Ahmed",
  });

  const claims = await waitForClaims(user, (c) => c.role !== undefined, "newcomer claims");
  assert.equal(claims.role, "member");
  assert.equal(claims.status, "pending");

  // Its own document, and nothing else.
  const own = await getDoc(doc(c.db, "users", user.uid));
  assert.equal(own.exists(), true);
  assert.equal(own.data().status, "pending");
  assert.equal(own.data().name, "Rizu Ahmed");

  await assert.rejects(() => getDoc(doc(c.db, "episodes", "ep41")), /permission|PERMISSION/);
  await assert.rejects(() => getDoc(doc(c.db, "settings", "global")), /permission|PERMISSION/);
  await assert.rejects(() => getDoc(doc(c.db, "users", ownerUser.uid)), /permission|PERMISSION/);
  await assert.rejects(
    () => updateDoc(doc(c.db, "users", user.uid), { status: "approved" }),
    /permission|PERMISSION/
  );

  // It can, however, finish its registration.
  await updateDoc(doc(c.db, "users", user.uid), {
    crafts: ["Voice"],
    phone: "+8801712344192",
    note: "Available evenings.",
  });
});

test("approval unlocks the account without a new sign-in", async () => {
  const owner = openClient("owner-approving");
  const ownerUser = await signInAsGoogle(owner, {
    sub: "uid-real-owner",
    email: OWNER_EMAIL,
    name: "Kahiniscope",
  });
  await waitForClaims(ownerUser, (c) => c.role === "owner", "owner claims");

  const c = openClient("newcomer-approved");
  const user = await signInAsGoogle(c, {
    sub: "uid-newcomer",
    email: "rizu.ahmed@gmail.com",
    name: "Rizu Ahmed",
  });
  await waitForClaims(user, (c) => c.status === "pending", "pending claims");

  // The approval itself: one field, written by the admin console.
  await updateDoc(doc(owner.db, "users", user.uid), { status: "approved" });

  const claims = await waitForClaims(
    user,
    (c) => c.status === "approved",
    "approval to reach the token"
  );
  assert.equal(claims.role, "member");

  // The same session — no sign-out — can now see the slate.
  const ep = await getDoc(doc(c.db, "episodes", "ep41"));
  assert.equal(ep.data().code, "EP-41");
  const settings = await getDoc(doc(c.db, "settings", "global"));
  assert.deepEqual(settings.data().plan, [7, 4, 3, 2, 1]);
});

test("nobody but the owner address can hold the owner role", async () => {
  const owner = openClient("owner-overreaching");
  const ownerUser = await signInAsGoogle(owner, {
    sub: "uid-real-owner",
    email: OWNER_EMAIL,
    name: "Kahiniscope",
  });
  await waitForClaims(ownerUser, (c) => c.role === "owner", "owner claims");

  const c = openClient("newcomer-not-owner");
  const user = await signInAsGoogle(c, {
    sub: "uid-newcomer",
    email: "rizu.ahmed@gmail.com",
    name: "Rizu Ahmed",
  });

  // Even the owner cannot mint a second owner: the trigger rewrites it.
  await updateDoc(doc(owner.db, "users", user.uid), { role: "owner" });

  const repaired = await waitForDoc(
    owner.db,
    ["users", user.uid],
    (d) => d.role !== "owner",
    "the owner role to be rejected"
  );
  assert.equal(repaired.role, "admin");

  const claims = await waitForClaims(user, (c) => c.role === "admin", "admin claims");
  assert.equal(claims.role, "admin");
  assert.notEqual(claims.role, "owner");

  await signOut(c.auth);
});

test("the owner cannot lock themselves out", async () => {
  const owner = openClient("owner-selfdemote");
  const ownerUser = await signInAsGoogle(owner, {
    sub: "uid-real-owner",
    email: OWNER_EMAIL,
    name: "Kahiniscope",
  });
  await waitForClaims(ownerUser, (c) => c.role === "owner", "owner claims");

  await updateDoc(doc(owner.db, "users", ownerUser.uid), {
    role: "member",
    status: "pending",
  });

  const restored = await waitForDoc(
    owner.db,
    ["users", ownerUser.uid],
    (d) => d.role === "owner",
    "the owner document to be restored"
  );
  assert.equal(restored.status, "approved");
});
