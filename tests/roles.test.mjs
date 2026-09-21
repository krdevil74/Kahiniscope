/**
 * Promotion, demotion, and the settings only the owner may write.
 *
 * The claim is the boundary, so these tests check what a token can actually do
 * after each change — not merely what the callable returned.
 *
 *   npm run test:roles
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
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  updateDoc,
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

/** An approved member, ready to be promoted. */
async function approvedMember(owner, { sub, email, name }) {
  const ctx = client(`ctx-${sub}`);
  const user = await signIn(ctx, { sub, email, name });
  await waitForClaims(user, (c) => c.status === "pending", `${name} pending`);
  await updateDoc(doc(owner.db, "users", user.uid), { status: "approved", crafts: ["Voice"] });
  await waitForClaims(user, (c) => c.status === "approved", `${name} approved`);
  return { ctx, user };
}

let owner;
let ownerUser;

before(async () => {
  owner = client("roles-owner");
  ownerUser = await signIn(owner, { sub: "owner", email: OWNER_EMAIL, name: "Kahiniscope" });
  await waitForClaims(ownerUser, (c) => c.role === "owner", "owner claims");
  await setDoc(doc(owner.db, "settings", "global"), {
    plan: [7, 4, 3, 2, 1],
    quietHours: { enabled: true, from: 22, to: 8, sendQueuedAt: 9 },
    channels: { push: true, telegram: true, whatsapp: true, sms: false, email: false },
  });
});

after(async () => {
  for (const app of apps) await deleteApp(app).catch(() => {});
});

test("the owner promotes a member, and the new admin can work the queue", async () => {
  const { ctx, user } = await approvedMember(owner, {
    sub: "promote-1",
    email: "piyali@gmail.com",
    name: "Piyali Sen",
  });

  // Before: a member sees nothing of the team.
  await assert.rejects(() => getDocs(collection(ctx.db, "users")), /permission|PERMISSION/);

  const setRole = httpsCallable(owner.functions, "setMemberRole");
  const result = await setRole({ uid: user.uid, role: "admin" });
  assert.equal(result.data.name, "Piyali Sen");

  await waitForClaims(user, (c) => c.role === "admin", "admin claims");

  // After: the queue is theirs to work.
  await assert.doesNotReject(() => getDocs(collection(ctx.db, "users")));
});

test("demoting takes it away again", async () => {
  const { ctx, user } = await approvedMember(owner, {
    sub: "promote-2",
    email: "tanmoy@gmail.com",
    name: "Tanmoy Das",
  });

  const setRole = httpsCallable(owner.functions, "setMemberRole");
  await setRole({ uid: user.uid, role: "admin" });
  await waitForClaims(user, (c) => c.role === "admin", "admin claims");

  await setRole({ uid: user.uid, role: "member" });

  // Demotion revokes the refresh token, so the session has to re-mint before
  // it can be asked anything — which is the point.
  await ctx.auth.currentUser.reload().catch(() => {});
  const refreshed = await signIn(ctx, {
    sub: "promote-2",
    email: "tanmoy@gmail.com",
    name: "Tanmoy Das",
  });
  await waitForClaims(refreshed, (c) => c.role === "member", "member claims");

  await assert.rejects(() => getDocs(collection(ctx.db, "users")), /permission|PERMISSION/);
});

test("an admin cannot promote anybody, themselves included", async () => {
  const { ctx, user } = await approvedMember(owner, {
    sub: "promote-3",
    email: "arif@gmail.com",
    name: "Arif Hossain",
  });
  const setRole = httpsCallable(owner.functions, "setMemberRole");
  await setRole({ uid: user.uid, role: "admin" });
  await waitForClaims(user, (c) => c.role === "admin", "admin claims");

  const victim = await approvedMember(owner, {
    sub: "promote-4",
    email: "sohag@gmail.com",
    name: "Sohag Mia",
  });

  const asAdmin = httpsCallable(ctx.functions, "setMemberRole");
  await assert.rejects(
    () => asAdmin({ uid: victim.user.uid, role: "admin" }),
    /permission-denied|Only the master admin/
  );
  await assert.rejects(
    () => asAdmin({ uid: user.uid, role: "admin" }),
    /permission-denied|Only the master admin/
  );

  // And the direct write the rules guard is refused too.
  await assert.rejects(
    () => updateDoc(doc(ctx.db, "users", victim.user.uid), { role: "admin" }),
    /permission|PERMISSION/
  );
});

test("a pending registration cannot be made an admin", async () => {
  const ctx = client("ctx-pending-promote");
  const user = await signIn(ctx, { sub: "promote-5", email: "rupa@gmail.com", name: "Rupa Dutta" });
  await waitForClaims(user, (c) => c.status === "pending", "pending claims");

  const setRole = httpsCallable(owner.functions, "setMemberRole");
  await assert.rejects(
    () => setRole({ uid: user.uid, role: "admin" }),
    /failed-precondition|Approve this registration/
  );
});

test("there is no second owner, and the owner cannot change their own role", async () => {
  const { user } = await approvedMember(owner, {
    sub: "promote-6",
    email: "nabanita@gmail.com",
    name: "Nabanita Roy",
  });
  const setRole = httpsCallable(owner.functions, "setMemberRole");

  await assert.rejects(() => setRole({ uid: user.uid, role: "owner" }), /invalid-argument|admin or member/);
  await assert.rejects(
    () => setRole({ uid: ownerUser.uid, role: "member" }),
    /failed-precondition|your own role/
  );

  const stillOwner = await getDoc(doc(owner.db, "users", ownerUser.uid));
  assert.equal(stillOwner.data().role, "owner");
});

test("the ladder and the channels are the owner's alone", async () => {
  const { ctx, user } = await approvedMember(owner, {
    sub: "promote-7",
    email: "shuvo@gmail.com",
    name: "Shuvo Karim",
  });
  const setRole = httpsCallable(owner.functions, "setMemberRole");
  await setRole({ uid: user.uid, role: "admin" });
  await waitForClaims(user, (c) => c.role === "admin", "admin claims");

  // An admin reads the settings — every countdown is computed from them —
  // but cannot touch them.
  await assert.doesNotReject(() => getDoc(doc(ctx.db, "settings", "global")));
  await assert.rejects(
    () => updateDoc(doc(ctx.db, "settings", "global"), { plan: [1, 1, 1, 1, 1] }),
    /permission|PERMISSION/
  );
  await assert.rejects(
    () => updateDoc(doc(ctx.db, "settings", "global"), { channels: { sms: true } }),
    /permission|PERMISSION/
  );
  await assert.rejects(
    () => updateDoc(doc(ctx.db, "settings", "global"), { quietHours: { enabled: false } }),
    /permission|PERMISSION/
  );

  // The owner may.
  await assert.doesNotReject(() => updateDoc(doc(owner.db, "settings", "global"), { plan: [7, 4, 3, 2, 1] }));
});
