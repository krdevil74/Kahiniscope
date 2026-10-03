/**
 * What the Episodes screen asks Firestore for, against the emulators.
 *
 * The screen used to load every episode and every task to draw two numbers.
 * These are the bounded questions that replaced it, and the two traps they have
 * to survive:
 *
 *  - **The old status spellings.** "production" and "released" are on real
 *    documents, and `where status == "in_progress"` does not match an episode
 *    stored as "production". Every query here asks for both.
 *  - **Episodes with no broadcast date.** A query ordered by `broadcastAt`
 *    skips documents that lack it, so those episodes are invisible under every
 *    month. The screen counts them and says so; this proves the count is right.
 *
 *   npm run test:slate
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
  count,
  doc,
  getAggregateFromServer,
  getDocs,
  getFirestore,
  limit as fsLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";

const OWNER_EMAIL = "owner@kahiniscope.test";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
const projectId = process.env.GCLOUD_PROJECT ?? "kahiniscope-demo";

/** The same two lists the app queries with — see lib/episode-status.ts. */
const IN_PROGRESS_VALUES = ["in_progress", "production"];
const BROADCAST_VALUES = ["broadcast", "released"];

const apps = [];

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

let owner;

/** Episodes planted for this suite only, under their own code prefix. */
const MINE = "SLATE";
let seq = 0;

async function episode({ status, broadcastAt = null, airDate = new Date(2026, 0, 1) }) {
  const id = `slate-${(seq += 1)}`;
  await setDoc(doc(owner.db, "episodes", id), {
    code: `${MINE}-${seq}`,
    title: "স্লেট",
    airDate: Timestamp.fromDate(airDate),
    status,
    ...(broadcastAt ? { broadcastAt: Timestamp.fromDate(broadcastAt) } : {}),
  });
  return id;
}

const countOf = async (...constraints) =>
  Number(
    (
      await getAggregateFromServer(query(collection(owner.db, "episodes"), ...constraints), {
        n: count(),
      })
    ).data().n
  );

before(async () => {
  owner = client("slate-owner");
  const ownerUser = await signIn(owner, { sub: "owner", email: OWNER_EMAIL, name: "Kahiniscope" });
  await waitForClaims(ownerUser, (c) => c.role === "owner", "owner claims");
});

after(async () => {
  for (const app of apps) await deleteApp(app).catch(() => {});
});

test("the counts include the spellings written before the life cycle existed", async () => {
  const beforeLive = await countOf(where("status", "in", IN_PROGRESS_VALUES));
  const beforeAired = await countOf(where("status", "in", BROADCAST_VALUES));

  await episode({ status: "in_progress" });
  await episode({ status: "production" });
  await episode({ status: "broadcast", broadcastAt: new Date(2026, 8, 14) });
  await episode({ status: "released", broadcastAt: new Date(2026, 8, 20) });

  assert.equal(
    await countOf(where("status", "in", IN_PROGRESS_VALUES)),
    beforeLive + 2,
    "an episode stored as 'production' is in progress, and a query on the new spelling alone would miss it"
  );
  assert.equal(await countOf(where("status", "in", BROADCAST_VALUES)), beforeAired + 2);
});

test("the dated count is how many can be filtered, which is not the same number", async () => {
  const beforeAired = await countOf(where("status", "in", BROADCAST_VALUES));
  const beforeDated = await countOf(where("status", "in", BROADCAST_VALUES), orderBy("broadcastAt"));

  // Marked broadcast before the app recorded when — exactly the live data this
  // ships into.
  await episode({ status: "broadcast" });

  const aired = await countOf(where("status", "in", BROADCAST_VALUES));
  const dated = await countOf(where("status", "in", BROADCAST_VALUES), orderBy("broadcastAt"));

  assert.equal(aired, beforeAired + 1, "it counts as broadcast");
  assert.equal(dated, beforeDated, "and not as datable — which is the gap the screen reports");
  assert.equal(aired - dated >= 1, true);
});

test("a month returns what went out in it, by the broadcast date", async () => {
  // Due in August, marked broadcast in September: it went out in September,
  // and that is the month it has to appear under.
  const late = await episode({
    status: "broadcast",
    airDate: new Date(2026, 7, 20),
    broadcastAt: new Date(2026, 8, 3, 11, 0),
  });
  const onTime = await episode({
    status: "broadcast",
    airDate: new Date(2026, 8, 25),
    broadcastAt: new Date(2026, 8, 25, 19, 0),
  });
  const october = await episode({
    status: "broadcast",
    airDate: new Date(2026, 9, 2),
    broadcastAt: new Date(2026, 9, 2, 19, 0),
  });

  const inMonth = async (year, month) =>
    (
      await getDocs(
        query(
          collection(owner.db, "episodes"),
          where("status", "in", BROADCAST_VALUES),
          where("broadcastAt", ">=", Timestamp.fromDate(new Date(year, month - 1, 1))),
          where("broadcastAt", "<", Timestamp.fromDate(new Date(year, month, 1))),
          orderBy("broadcastAt", "desc")
        )
      )
    ).docs.map((d) => d.id);

  const september = await inMonth(2026, 9);
  assert.ok(september.includes(late), "the one that slipped is in the month it actually went out");
  assert.ok(september.includes(onTime));
  assert.equal(september.includes(october), false);

  // Newest first, which is the order the list is read in.
  assert.ok(
    september.indexOf(onTime) < september.indexOf(late),
    "the 25th comes before the 3rd"
  );

  assert.ok((await inMonth(2026, 10)).includes(october));
});

test("the year filter's floor is one document, not the collection", async () => {
  await episode({ status: "broadcast", broadcastAt: new Date(2024, 2, 9) });

  const first = await getDocs(
    query(
      collection(owner.db, "episodes"),
      where("status", "in", BROADCAST_VALUES),
      orderBy("broadcastAt", "asc"),
      fsLimit(1)
    )
  );

  assert.equal(first.size, 1, "one read answers how far back the filter should offer");
  assert.equal(first.docs[0].data().broadcastAt.toDate().getFullYear(), 2024);
});

test("marking an episode broadcast is what stamps the date", async () => {
  // What the app writes from the status switch, and what it clears on the way
  // back — an episode reopened and broadcast again carries the second date.
  const id = await episode({ status: "in_progress" });
  const ref = doc(owner.db, "episodes", id);

  await updateDoc(ref, { status: "broadcast", broadcastAt: Timestamp.now() });
  const aired = (await getDocs(query(collection(owner.db, "episodes"), where("status", "in", BROADCAST_VALUES), orderBy("broadcastAt", "desc"), fsLimit(1)))).docs[0];
  assert.equal(aired.id, id, "the newest broadcast episode is the one just marked");

  await updateDoc(ref, { status: "in_progress", broadcastAt: null });
  const back = await getDocs(
    query(collection(owner.db, "episodes"), where("status", "in", IN_PROGRESS_VALUES))
  );
  assert.ok(back.docs.some((d) => d.id === id), "and it is back on the slate");
});

test("the cards' tasks are fetched for the episodes on screen, in both shapes", async () => {
  // `episodeId` is a DocumentReference on everything the Assign form wrote and
  // a string on everything the seed wrote. A query on one shape does not match
  // the other, so the screen asks twice and merges — this is that pair.
  const a = await episode({ status: "in_progress" });
  const b = await episode({ status: "in_progress" });

  const base = {
    assigneeUid: "someone",
    type: "Voice recording",
    dueDate: Timestamp.now(),
    status: "open",
    done: false,
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: Timestamp.now(),
    preferredChannel: null,
  };
  const byRef = await addDoc(collection(owner.db, "tasks"), {
    ...base,
    episodeId: doc(owner.db, "episodes", a),
  });
  const byString = await addDoc(collection(owner.db, "tasks"), { ...base, episodeId: b });

  const ids = [a, b];
  const [refs, strings] = await Promise.all([
    getDocs(
      query(
        collection(owner.db, "tasks"),
        where("episodeId", "in", ids.map((id) => doc(owner.db, "episodes", id)))
      )
    ),
    getDocs(query(collection(owner.db, "tasks"), where("episodeId", "in", ids))),
  ]);

  const found = new Set([...refs.docs, ...strings.docs].map((d) => d.id));
  assert.ok(found.has(byRef.id), "the reference-shaped task");
  assert.ok(found.has(byString.id), "and the string-shaped one");

  // Neither query alone would have found both, which is the whole point.
  assert.equal(refs.docs.some((d) => d.id === byString.id), false);
  assert.equal(strings.docs.some((d) => d.id === byRef.id), false);
});

test("a member cannot count the slate, only read what it is shown", async () => {
  // Episodes are readable by every approved account — the member's own task
  // rows name a code and a title — so this is a read they are allowed.
  const member = client("slate-member");
  const user = await signIn(member, { sub: "slate-member", email: "slate@gmail.com", name: "Member" });
  await waitForClaims(user, (c) => c.status === "pending", "pending claims");

  // Pending, not approved: no read at all yet.
  await assert.rejects(() => getDocs(collection(member.db, "episodes")));

  await updateDoc(doc(owner.db, "users", user.uid), { status: "approved" });
  await waitForClaims(user, (c) => c.status === "approved", "approved claims");

  const listed = await getDocs(
    query(collection(member.db, "episodes"), where("status", "in", IN_PROGRESS_VALUES))
  );
  assert.ok(listed.size >= 1, "approved, so the slate is readable");
});
