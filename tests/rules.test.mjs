/**
 * Firestore security rules, exercised against the emulator.
 *
 * This is the acceptance test for build-order step 1: a second Google account
 * lands pending and can read nothing. Run with:
 *
 *   npm run test:rules
 *
 * which starts the Firestore emulator, runs this file and shuts down again.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";

const rulesPath = fileURLToPath(new URL("../firestore.rules", import.meta.url));
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

/** uids used throughout. */
const OWNER = "uid-owner";
const ADMIN = "uid-admin";
const MEMBER = "uid-rizu";
const OTHER_MEMBER = "uid-tanvir";
const PENDING = "uid-newcomer";

const SCRIPT_URL = "https://drive.google.com/file/d/1AbCdEfGhIj/view";

let env;

/** Contexts carry exactly the claims the auth triggers mint. */
const asOwner = () => env.authenticatedContext(OWNER, { role: "owner", status: "approved" }).firestore();
const asAdmin = () => env.authenticatedContext(ADMIN, { role: "admin", status: "approved" }).firestore();
const asMember = () => env.authenticatedContext(MEMBER, { role: "member", status: "approved" }).firestore();
const asOtherMember = () => env.authenticatedContext(OTHER_MEMBER, { role: "member", status: "approved" }).firestore();
/** A brand-new Google sign-in: the claims onBeforeCreate gives a stranger. */
const asPending = () => env.authenticatedContext(PENDING, { role: "member", status: "pending" }).firestore();
/** A token minted before claims existed carries nothing at all. */
const asClaimless = () => env.authenticatedContext("uid-claimless", {}).firestore();
const asAnon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "kahiniscope-rules-test",
    firestore: { rules: readFileSync(rulesPath, "utf8"), host, port: Number(port) },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, "users", OWNER), user({ name: "Kahiniscope", email: "owner@kahiniscope.test", role: "owner", status: "approved" }));
    await setDoc(doc(db, "users", ADMIN), user({ name: "Admin", email: "admin@gmail.com", role: "admin", status: "approved" }));
    await setDoc(doc(db, "users", MEMBER), user({ name: "Rizu Ahmed", email: "rizu@gmail.com", crafts: ["Voice"] }));
    await setDoc(doc(db, "users", OTHER_MEMBER), user({ name: "Tanvir", email: "tanvir@gmail.com", crafts: ["Editing"] }));
    await setDoc(doc(db, "users", PENDING), user({ name: "Newcomer", email: "newcomer@gmail.com", status: "pending", crafts: [] }));

    await setDoc(doc(db, "episodes", "ep41"), {
      code: "EP-41",
      title: "রক্তমুখী নীলা",
      airDate: Timestamp.now(),
      status: "production",
    });

    await setDoc(doc(db, "episodes", "ep42"), {
      code: "EP-42",
      title: "শেষ ট্রামের যাত্রী",
      airDate: Timestamp.now(),
      status: "broadcast",
    });

    // What syncEpisodeRosterOnTaskWrite writes: who has a task on EP-41. The
    // rules read this to decide who may open the script.
    await setDoc(doc(db, "episodes", "ep41", "private", "roster"), {
      uids: [MEMBER],
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, "episodes", "ep41", "private", "script"), {
      url: SCRIPT_URL,
      addedAt: Timestamp.now(),
      addedBy: ADMIN,
    });
    // EP-42 has a script but no roster — nobody has been assigned to it yet.
    await setDoc(doc(db, "episodes", "ep42", "private", "script"), {
      url: SCRIPT_URL,
      addedAt: Timestamp.now(),
      addedBy: ADMIN,
    });

    await setDoc(doc(db, "tasks", "t-mine"), task({ assigneeUid: MEMBER, type: "Voice recording" }));
    await setDoc(doc(db, "tasks", "t-theirs"), task({ assigneeUid: OTHER_MEMBER, type: "Editing" }));
    // Accepted before the review flow existed: only `done`, no status at all.
    const legacy = task({ assigneeUid: MEMBER, type: "Editing" });
    delete legacy.status;
    await setDoc(doc(db, "tasks", "t-done"), { ...legacy, done: true, doneAt: Timestamp.now() });

    await setDoc(doc(db, "payments", "pay-mine"), payment({ uid: MEMBER }));
    await setDoc(doc(db, "advances", "adv-mine"), {
      uid: MEMBER,
      amount: 5000,
      note: "Before EP-41",
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, "advances", "adv-theirs"), {
      uid: OTHER_MEMBER,
      amount: 2000,
      note: null,
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, "payments", "pay-theirs"), payment({ uid: OTHER_MEMBER }));

    await setDoc(doc(db, "reminderLog", "log1"), {
      taskId: doc(db, "tasks", "t-mine"),
      uid: MEMBER,
      channel: "telegram",
      sentAt: Timestamp.now(),
      result: "delivered",
      error: null,
    });

    await setDoc(doc(db, "settings", "global"), {
      plan: [7, 4, 3, 2, 1],
      quietHours: { enabled: true, from: 22, to: 8, sendQueuedAt: 9 },
      channels: { push: true, telegram: true, whatsapp: true, sms: false, email: false },
    });
  });
});

function user(overrides) {
  return {
    name: "Someone",
    email: "someone@gmail.com",
    phone: "+919876543210",
    telegramChatId: null,
    crafts: ["Script"],
    status: "approved",
    role: "member",
    fcmTokens: [],
    note: null,
    createdAt: Timestamp.now(),
    ...overrides,
  };
}

function payment(overrides) {
  return {
    taskId: "t-mine",
    uid: MEMBER,
    episodeId: "ep41",
    taskType: "Voice recording",
    status: "pending",
    unit: "voice-narration",
    quantity: 12,
    rate: 35,
    estimatedAmount: 420,
    finalAmount: null,
    approvedAt: Timestamp.now(),
    paidAt: null,
    ...overrides,
  };
}

function task(overrides) {
  return {
    episodeId: "ep41",
    assigneeUid: MEMBER,
    type: "Voice recording",
    dueDate: Timestamp.now(),
    status: "open",
    done: false,
    doneAt: null,
    submittedAt: null,
    submissionNote: null,
    rejectedAt: null,
    rejectionNote: null,
    rejectedCount: 0,
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: Timestamp.now(),
    preferredChannel: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A pending registration — the step 1 acceptance criterion
// ---------------------------------------------------------------------------

test("pending: reads its own user document, and that is all", async () => {
  const db = asPending();
  await assertSucceeds(getDoc(doc(db, "users", PENDING)));

  await assertFails(getDoc(doc(db, "users", MEMBER)));
  await assertFails(getDocs(collection(db, "users")));
  await assertFails(getDoc(doc(db, "episodes", "ep41")));
  await assertFails(getDocs(collection(db, "episodes")));
  await assertFails(getDoc(doc(db, "tasks", "t-mine")));
  await assertFails(getDocs(collection(db, "tasks")));
  await assertFails(getDocs(query(collection(db, "tasks"), where("assigneeUid", "==", PENDING))));
  await assertFails(getDoc(doc(db, "settings", "global")));
  await assertFails(getDocs(collection(db, "reminderLog")));
});

test("pending: completes its own registration form", async () => {
  const db = asPending();
  await assertSucceeds(
    updateDoc(doc(db, "users", PENDING), {
      name: "Newcomer Ahmed",
      phone: "+919876543210",
      crafts: ["Script", "Proofreading"],
      note: "I have done three episodes of narration before.",
    })
  );
});

test("pending: cannot approve or promote itself", async () => {
  const db = asPending();
  await assertFails(updateDoc(doc(db, "users", PENDING), { status: "approved" }));
  await assertFails(updateDoc(doc(db, "users", PENDING), { role: "admin" }));
  await assertFails(updateDoc(doc(db, "users", PENDING), { role: "owner", status: "approved" }));
  await assertFails(updateDoc(doc(db, "users", PENDING), { crafts: ["Script"], status: "approved" }));
});

test("pending: cannot touch anyone else, or create work", async () => {
  const db = asPending();
  await assertFails(updateDoc(doc(db, "users", MEMBER), { status: "pending" }));
  await assertFails(setDoc(doc(db, "tasks", "t-new"), task({ assigneeUid: PENDING })));
  await assertFails(setDoc(doc(db, "episodes", "ep99"), { code: "EP-99" }));
  await assertFails(deleteDoc(doc(db, "users", MEMBER)));
});

test("pending: an invalid craft is rejected", async () => {
  const db = asPending();
  await assertFails(updateDoc(doc(db, "users", PENDING), { crafts: ["Executive Producer"] }));
  await assertFails(updateDoc(doc(db, "users", PENDING), { crafts: ["Voice", "Executive Producer"] }));
  await assertFails(
    updateDoc(doc(db, "users", PENDING), {
      crafts: ["Script", "Translation", "Voice", "Post / mix", "Graphics", "Editing"],
    })
  );
  await assertFails(updateDoc(doc(db, "users", PENDING), { crafts: "Voice" }));
  await assertFails(updateDoc(doc(db, "users", PENDING), { note: "x".repeat(501) }));
});

test("a token with no claims at all is treated as pending", async () => {
  const db = asClaimless();
  await assertFails(getDoc(doc(db, "episodes", "ep41")));
  await assertFails(getDoc(doc(db, "settings", "global")));
  await assertFails(getDocs(collection(db, "users")));
});

test("signed out: nothing", async () => {
  const db = asAnon();
  await assertFails(getDoc(doc(db, "users", MEMBER)));
  await assertFails(getDoc(doc(db, "episodes", "ep41")));
  await assertFails(getDoc(doc(db, "settings", "global")));
  await assertFails(getDoc(doc(db, "tasks", "t-mine")));
});

// ---------------------------------------------------------------------------
// Approved member
// ---------------------------------------------------------------------------

test("member: reads its own tasks and no one else's", async () => {
  const db = asMember();
  await assertSucceeds(getDoc(doc(db, "tasks", "t-mine")));
  await assertSucceeds(getDocs(query(collection(db, "tasks"), where("assigneeUid", "==", MEMBER))));

  await assertFails(getDoc(doc(db, "tasks", "t-theirs")));
  await assertFails(getDocs(collection(db, "tasks")));
  await assertFails(getDocs(query(collection(db, "tasks"), where("assigneeUid", "==", OTHER_MEMBER))));
});

test("member: reads episodes and the ladder, so countdowns compute", async () => {
  const db = asMember();
  await assertSucceeds(getDoc(doc(db, "episodes", "ep41")));
  await assertSucceeds(getDocs(collection(db, "episodes")));
  await assertSucceeds(getDoc(doc(db, "settings", "global")));
});

test("member: touches nothing on its own task but the submission", async () => {
  const db = asMember();
  // Marking work done used to be the member's to do. Accepting work is the
  // admin's now, because accepting it opens a payment.
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { done: true, doneAt: Timestamp.now() }));

  // Values that genuinely differ from the seeded document: the rule works off
  // diff().affectedKeys(), so rewriting a field with the value it already has
  // is not a change and is correctly allowed through as a no-op.
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { remindersSent: 3 }));
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { lastReminderAt: Timestamp.now() }));
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { dueDate: Timestamp.fromMillis(0) }));
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { done: true, remindersSent: 5 }));
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { assigneeUid: OTHER_MEMBER }));
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { done: "yes" }));
});

test("member: cannot tick someone else's task, or hand one to itself", async () => {
  const db = asMember();
  await assertFails(updateDoc(doc(db, "tasks", "t-theirs"), { done: true }));
  await assertFails(updateDoc(doc(db, "tasks", "t-theirs"), { assigneeUid: MEMBER }));
  await assertFails(setDoc(doc(db, "tasks", "t-new"), task({})));
  await assertFails(deleteDoc(doc(db, "tasks", "t-mine")));
});

test("member: cannot see the team, the log, or edit episodes and settings", async () => {
  const db = asMember();
  await assertFails(getDoc(doc(db, "users", OTHER_MEMBER)));
  await assertFails(getDocs(collection(db, "users")));
  await assertFails(getDocs(collection(db, "reminderLog")));
  await assertFails(setDoc(doc(db, "episodes", "ep41"), { code: "EP-41" }));
  await assertFails(updateDoc(doc(db, "settings", "global"), { plan: [1, 1, 1, 1, 1] }));
});

test("member: keeps its own FCM tokens, but not its status", async () => {
  const db = asMember();
  await assertSucceeds(updateDoc(doc(db, "users", MEMBER), { fcmTokens: ["token-a"] }));
  await assertFails(updateDoc(doc(db, "users", MEMBER), { role: "admin" }));
  await assertFails(updateDoc(doc(db, "users", MEMBER), { status: "pending" }));
  await assertFails(updateDoc(doc(db, "users", OTHER_MEMBER), { fcmTokens: ["token-b"] }));
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

test("admin: works the queue — approve, revoke, decline", async () => {
  const db = asAdmin();
  await assertSucceeds(getDocs(collection(db, "users")));
  await assertSucceeds(updateDoc(doc(db, "users", PENDING), { status: "approved" }));
  await assertSucceeds(updateDoc(doc(db, "users", MEMBER), { status: "pending" }));
  await assertSucceeds(deleteDoc(doc(db, "users", PENDING)));
});

test("admin: chooses which channel a person is reminded on", async () => {
  const db = asAdmin();
  await assertSucceeds(updateDoc(doc(db, "users", MEMBER), { preferredChannel: "telegram" }));
  await assertSucceeds(updateDoc(doc(db, "users", MEMBER), { preferredChannel: null }));
  // Approving and pinning a channel in one write is fine.
  await assertSucceeds(
    updateDoc(doc(db, "users", PENDING), { status: "approved", preferredChannel: "whatsapp" })
  );

  // But only a real channel.
  await assertFails(updateDoc(doc(db, "users", MEMBER), { preferredChannel: "carrier-pigeon" }));
  await assertFails(updateDoc(doc(db, "users", MEMBER), { preferredChannel: 4 }));
  // And still nothing else on somebody else's record.
  await assertFails(
    updateDoc(doc(db, "users", MEMBER), { preferredChannel: "sms", role: "admin" })
  );
  await assertFails(updateDoc(doc(db, "users", MEMBER), { phone: "+8800000000000" }));
});

test("a member cannot choose their own channel — that is the admin's call", async () => {
  await assertFails(updateDoc(doc(asMember(), "users", MEMBER), { preferredChannel: "sms" }));
  await assertFails(updateDoc(doc(asPending(), "users", PENDING), { preferredChannel: "sms" }));
});

test("admin: cannot promote anyone, itself included", async () => {
  const db = asAdmin();
  await assertFails(updateDoc(doc(db, "users", MEMBER), { role: "admin" }));
  await assertFails(updateDoc(doc(db, "users", ADMIN), { role: "owner" }));
  await assertFails(updateDoc(doc(db, "users", PENDING), { status: "approved", role: "admin" }));
  await assertFails(updateDoc(doc(db, "users", PENDING), { status: "banned" }));
});

test("admin: runs the board — episodes and tasks", async () => {
  const db = asAdmin();
  await assertSucceeds(setDoc(doc(db, "episodes", "ep44"), { code: "EP-44", title: "নতুন", status: "production", airDate: Timestamp.now() }));
  await assertSucceeds(setDoc(doc(db, "tasks", "t-new"), task({ assigneeUid: OTHER_MEMBER })));
  await assertSucceeds(getDocs(collection(db, "tasks")));
  await assertSucceeds(updateDoc(doc(db, "tasks", "t-theirs"), { done: true, doneAt: Timestamp.now() }));
  await assertSucceeds(deleteDoc(doc(db, "tasks", "t-theirs")));
});

test("admin: assigns a task exactly the way the Assign form writes one", async () => {
  const db = asAdmin();
  // A document reference for episodeId, as the data model specifies, and the
  // server's clock for assignedAt — that field starts the 7-day countdown.
  const created = await assertSucceeds(
    addDoc(collection(db, "tasks"), {
      episodeId: doc(db, "episodes", "ep41"),
      assigneeUid: MEMBER,
      type: "Upload & SEO",
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
      preferredChannel: "telegram",
    })
  );

  const back = await getDoc(doc(db, "tasks", created.id));
  assert.equal(back.data().episodeId.id, "ep41");
  assert.equal(back.data().assignedAt instanceof Timestamp, true);

  // And the member it was given to can see it, and hand it in.
  const mine = asMember();
  await assertSucceeds(getDoc(doc(mine, "tasks", created.id)));
  await assertSucceeds(
    updateDoc(doc(mine, "tasks", created.id), { status: "submitted", submittedAt: Timestamp.now() })
  );
});

test("a member cannot assign work, to themselves or anyone", async () => {
  const db = asMember();
  await assertFails(
    addDoc(collection(db, "tasks"), {
      episodeId: doc(db, "episodes", "ep41"),
      assigneeUid: MEMBER,
      type: "Upload & SEO",
      dueDate: Timestamp.now(),
      done: false,
      remindersSent: 0,
      assignedAt: serverTimestamp(),
    })
  );
});

test("admin: creates an episode the way the Assign form does", async () => {
  const db = asAdmin();
  const created = await assertSucceeds(
    addDoc(collection(db, "episodes"), {
      code: "EP-44",
      title: "নতুন গল্প",
      airDate: Timestamp.now(),
      status: "production",
    })
  );
  const back = await getDoc(doc(db, "episodes", created.id));
  assert.equal(back.data().title, "নতুন গল্প");

  await assertFails(
    addDoc(collection(asMember(), "episodes"), { code: "EP-45", title: "x", status: "production" })
  );
});

test("admin: reads the reminder feed but never writes it", async () => {
  const db = asAdmin();
  await assertSucceeds(getDocs(collection(db, "reminderLog")));
  await assertFails(setDoc(doc(db, "reminderLog", "forged"), { channel: "sms", result: "delivered" }));
  await assertFails(deleteDoc(doc(db, "reminderLog", "log1")));
});

test("admin: cannot edit the escalation ladder", async () => {
  const db = asAdmin();
  await assertSucceeds(getDoc(doc(db, "settings", "global")));
  await assertFails(updateDoc(doc(db, "settings", "global"), { plan: [1, 1, 1, 1, 1] }));
});

// ---------------------------------------------------------------------------
// Owner
// ---------------------------------------------------------------------------

test("owner: promotes, demotes and edits the ladder", async () => {
  const db = asOwner();
  await assertSucceeds(updateDoc(doc(db, "users", MEMBER), { role: "admin" }));
  await assertSucceeds(updateDoc(doc(db, "users", ADMIN), { role: "member" }));
  await assertSucceeds(updateDoc(doc(db, "settings", "global"), { plan: [7, 4, 3, 2, 1] }));
  await assertSucceeds(updateDoc(doc(db, "settings", "global"), { quietHours: { enabled: false, from: 22, to: 8, sendQueuedAt: 9 } }));
});

test("owner: still cannot forge the reminder log", async () => {
  const db = asOwner();
  await assertFails(setDoc(doc(db, "reminderLog", "forged"), { channel: "sms", result: "delivered" }));
});

test("nobody creates a user document from a client", async () => {
  await assertFails(setDoc(doc(asOwner(), "users", "uid-injected"), user({})));
  await assertFails(setDoc(doc(asAdmin(), "users", "uid-injected"), user({})));
  await assertFails(setDoc(doc(asPending(), "users", "uid-injected"), user({})));
});

test("unknown collections are closed", async () => {
  await assertFails(getDocs(collection(asOwner(), "secrets")));
  await assertFails(setDoc(doc(asOwner(), "secrets", "x"), { a: 1 }));
});

test("admin: keeps a person's crafts right, and nothing else about them", async () => {
  const db = asAdmin();
  // The person page is where "she does the voices as well now" is recorded.
  await assertSucceeds(updateDoc(doc(db, "users", MEMBER), { crafts: ["Voice", "Editing"] }));
  // Still only a craft the app offers, and still capped.
  await assertFails(updateDoc(doc(db, "users", MEMBER), { crafts: ["Executive Producer"] }));
  // Identity is not an admin's to edit.
  await assertFails(updateDoc(doc(db, "users", MEMBER), { name: "Someone Else" }));
  await assertFails(updateDoc(doc(db, "users", MEMBER), { phone: "+8801700000000" }));
});

test("members and contacts are not writable by a member", async () => {
  const db = asMember();
  // A contact record is an ordinary user document: the same rules hold, so
  // nobody can quietly reassign one to themselves.
  await assertFails(updateDoc(doc(db, "users", OTHER_MEMBER), { crafts: ["Voice"] }));
  await assertFails(updateDoc(doc(db, "users", OTHER_MEMBER), { accountless: false }));
});

// ---------------------------------------------------------------------------
// Handing work in, and being paid for it
// ---------------------------------------------------------------------------

test("member: hands their own work in, and nothing more", async () => {
  const db = asMember();
  await assertSucceeds(
    updateDoc(doc(db, "tasks", "t-mine"), { status: "submitted", submittedAt: Timestamp.now() })
  );
});

test("member: can say something about what they handed in", async () => {
  const db = asMember();
  await assertSucceeds(
    updateDoc(doc(db, "tasks", "t-mine"), {
      status: "submitted",
      submittedAt: Timestamp.now(),
      submissionNote: "Re-recorded from 4:10. File is in the shared drive.",
    })
  );
  // Within reason.
  await assertFails(
    updateDoc(doc(db, "tasks", "t-mine"), {
      status: "submitted",
      submittedAt: Timestamp.now(),
      submissionNote: "x".repeat(501),
    })
  );
  // And not as a way to smuggle in a field they do not own.
  await assertFails(
    updateDoc(doc(db, "tasks", "t-mine"), {
      status: "submitted",
      submissionNote: "fine",
      rejectionNote: "no it is not",
    })
  );
});

test("member: cannot accept, price or close their own work", async () => {
  const db = asMember();
  // Approving is the admin's, and it opens a payment record.
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { status: "approved" }));
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { status: "paid" }));
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { done: true }));
  // Nor invent a reason it was sent back, nor rewind the reminder clock.
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { status: "submitted", rejectionNote: "looks fine to me" }));
  await assertFails(updateDoc(doc(db, "tasks", "t-mine"), { status: "submitted", remindersSent: 7 }));
});

test("member: cannot hand in somebody else's work", async () => {
  const db = asMember();
  await assertFails(
    updateDoc(doc(db, "tasks", "t-theirs"), { status: "submitted", submittedAt: Timestamp.now() })
  );
});

test("member: cannot reopen work that has already been accepted", async () => {
  const db = asMember();
  await assertFails(
    updateDoc(doc(db, "tasks", "t-done"), { status: "submitted", submittedAt: Timestamp.now() })
  );
});

test("payments: a member reads their own and writes none of them", async () => {
  const db = asMember();
  await assertSucceeds(getDoc(doc(db, "payments", "pay-mine")));
  await assertFails(getDoc(doc(db, "payments", "pay-theirs")));
  // The amount is the whole point of the document.
  await assertFails(updateDoc(doc(db, "payments", "pay-mine"), { finalAmount: 99999 }));
  await assertFails(setDoc(doc(db, "payments", "pay-new"), { uid: MEMBER, status: "paid" }));
});

test("payments: an admin reads everybody's, and still writes none", async () => {
  const db = asAdmin();
  await assertSucceeds(getDoc(doc(db, "payments", "pay-mine")));
  await assertFails(updateDoc(doc(db, "payments", "pay-mine"), { status: "paid" }));
});

test("admin: sets a rate card, but only a rate card", async () => {
  const db = asAdmin();
  await assertSucceeds(
    updateDoc(doc(db, "users", MEMBER), {
      rates: { voiceCharacter: 50, voiceNarration: 35, soundDesign: null, cover: null },
    })
  );
  // Rates are numbers, and only the four the app knows about.
  await assertFails(updateDoc(doc(db, "users", MEMBER), { rates: { voiceCharacter: "50" } }));
  await assertFails(updateDoc(doc(db, "users", MEMBER), { rates: { voiceCharacter: -1 } }));
  await assertFails(updateDoc(doc(db, "users", MEMBER), { rates: { perEpisode: 500 } }));
});

test("member: cannot set their own rate", async () => {
  const db = asMember();
  await assertFails(updateDoc(doc(db, "users", MEMBER), { rates: { voiceCharacter: 5000 } }));
});

test("advances: a member sees their own and writes none", async () => {
  const db = asMember();
  await assertSucceeds(getDoc(doc(db, "advances", "adv-mine")));
  await assertFails(getDoc(doc(db, "advances", "adv-theirs")));
  await assertFails(setDoc(doc(db, "advances", "adv-new"), { uid: MEMBER, amount: 99999 }));
  await assertFails(updateDoc(doc(db, "advances", "adv-mine"), { amount: 99999 }));
});

test("the balance is the server's, and nobody else's", async () => {
  // Not an admin's either: it moves only through addAdvance and through an
  // approval, both of which are transactions in a Cloud Function.
  await assertFails(updateDoc(doc(asMember(), "users", MEMBER), { balance: 99999 }));
  await assertFails(updateDoc(doc(asAdmin(), "users", MEMBER), { balance: 99999 }));
  await assertFails(updateDoc(doc(asAdmin(), "users", MEMBER), { rates: { cover: 700 }, balance: 5 }));
});

test("advances: an admin reads everybody's, and still writes none", async () => {
  const db = asAdmin();
  await assertSucceeds(getDoc(doc(db, "advances", "adv-theirs")));
  await assertFails(updateDoc(doc(db, "advances", "adv-mine"), { amount: 1 }));
});

// ---------------------------------------------------------------------------
// The episode script
//
// One Drive link per episode, readable only by the people with a task on it.
// The check is a roster document the tasks trigger maintains — see
// functions/src/episode-roster.ts — so these tests seed the roster the way
// the trigger would have written it.
// ---------------------------------------------------------------------------

test("script: the member working on the episode opens it", async () => {
  const db = asMember();
  const snap = await assertSucceeds(getDoc(doc(db, "episodes", "ep41", "private", "script")));
  assert.equal(snap.data().url, SCRIPT_URL);
});

test("script: a member with no task on the episode is refused", async () => {
  // Tanvir is approved, and can read the episode itself — its code and title
  // are on his own payment rows. The script is the part he does not get.
  const db = asOtherMember();
  await assertSucceeds(getDoc(doc(db, "episodes", "ep41")));
  await assertFails(getDoc(doc(db, "episodes", "ep41", "private", "script")));
});

test("script: an episode nobody is assigned to yet is refused to everyone but the admin", async () => {
  await assertFails(getDoc(doc(asMember(), "episodes", "ep42", "private", "script")));
  await assertFails(getDoc(doc(asOtherMember(), "episodes", "ep42", "private", "script")));
  await assertSucceeds(getDoc(doc(asAdmin(), "episodes", "ep42", "private", "script")));
});

test("script: pending and signed-out accounts get nothing", async () => {
  await assertFails(getDoc(doc(asPending(), "episodes", "ep41", "private", "script")));
  await assertFails(getDoc(doc(asAnon(), "episodes", "ep41", "private", "script")));
  await assertFails(getDoc(doc(asClaimless(), "episodes", "ep41", "private", "script")));
});

test("script: the roster is never handed to a member, even their own", async () => {
  // It names everyone working on the episode. Knowing the check exists is
  // fine; reading the list it is made of is not.
  await assertFails(getDoc(doc(asMember(), "episodes", "ep41", "private", "roster")));
  await assertSucceeds(getDoc(doc(asAdmin(), "episodes", "ep41", "private", "roster")));
});

test("script: a member cannot list the subcollection to get around the per-document check", async () => {
  await assertFails(getDocs(collection(asMember(), "episodes", "ep41", "private")));
});

test("script: only an admin writes it", async () => {
  await assertSucceeds(
    setDoc(doc(asAdmin(), "episodes", "ep41", "private", "script"), {
      url: "https://docs.google.com/document/d/1Xyz/edit",
      addedAt: serverTimestamp(),
      addedBy: ADMIN,
    })
  );
  await assertFails(
    setDoc(doc(asMember(), "episodes", "ep41", "private", "script"), {
      url: SCRIPT_URL,
      addedAt: serverTimestamp(),
      addedBy: MEMBER,
    })
  );
  await assertSucceeds(deleteDoc(doc(asAdmin(), "episodes", "ep41", "private", "script")));
  await assertFails(deleteDoc(doc(asMember(), "episodes", "ep41", "private", "script")));
});

test("script: a link that is not Drive is refused at the rules, not only in the field", async () => {
  // The app validates this too. The rules are the copy that matters: a
  // member taps this link on trust, and the UI is not the boundary.
  for (const url of [
    "http://drive.google.com/file/d/1Abc/view",
    "https://example.com/script.pdf",
    "https://evilgoogle.com/file/d/1Abc/view",
    "https://drive.google.com.attacker.test/file/d/1Abc/view",
  ]) {
    await assertFails(
      setDoc(doc(asAdmin(), "episodes", "ep41", "private", "script"), {
        url,
        addedAt: serverTimestamp(),
        addedBy: ADMIN,
      })
    );
  }
});

test("script: an admin cannot write anything else into the subcollection", async () => {
  // The roster is the trigger's to write. A hand-edited one would hand the
  // script to whoever was added to it.
  await assertFails(
    setDoc(doc(asAdmin(), "episodes", "ep41", "private", "roster"), {
      uids: [ADMIN, OTHER_MEMBER],
      updatedAt: serverTimestamp(),
    })
  );
});

// ---------------------------------------------------------------------------
// The episode life cycle
// ---------------------------------------------------------------------------

test("episodes: an admin moves one between in progress and broadcast", async () => {
  const db = asAdmin();
  await assertSucceeds(updateDoc(doc(db, "episodes", "ep41"), { status: "broadcast" }));
  await assertSucceeds(updateDoc(doc(db, "episodes", "ep41"), { status: "in_progress" }));
});

test("episodes: a member cannot reopen a broadcast episode to get work onto it", async () => {
  await assertFails(updateDoc(doc(asMember(), "episodes", "ep42"), { status: "in_progress" }));
});

test("episodes: a status outside the life cycle is refused", async () => {
  await assertFails(updateDoc(doc(asAdmin(), "episodes", "ep41"), { status: "cancelled" }));
  await assertFails(updateDoc(doc(asAdmin(), "episodes", "ep41"), { status: 3 }));
});

test("episodes: the two old spellings still in the live database are still writable", async () => {
  // An admin editing a title on an episode created before the life cycle
  // existed must not be rejected for a field they never touched.
  await assertSucceeds(updateDoc(doc(asAdmin(), "episodes", "ep41"), { status: "production" }));
  await assertSucceeds(updateDoc(doc(asAdmin(), "episodes", "ep41"), { status: "released" }));
});

// ---------------------------------------------------------------------------
// The name on the registration form
//
// The form asks for a name now rather than taking the Google display name
// silently, because that name is what the admin reads on the new-task screen.
// ---------------------------------------------------------------------------

test("registration: a pending account sets its own name", async () => {
  await assertSucceeds(
    updateDoc(doc(asPending(), "users", PENDING), {
      name: "Newcomer Ahmed",
      phone: "+919876543210",
      crafts: ["Voice"],
      note: null,
    })
  );
});

test("registration: a Bengali name is accepted", async () => {
  await assertSucceeds(
    updateDoc(doc(asPending(), "users", PENDING), { name: "রিজু আহমেদ" })
  );
});

test("registration: an empty name is refused", async () => {
  // It would reach the admin's new-task screen as a blank chip with nothing
  // on it to identify who is being assigned the work.
  await assertFails(updateDoc(doc(asPending(), "users", PENDING), { name: "" }));
});

test("registration: a name past the cap is refused", async () => {
  await assertFails(
    updateDoc(doc(asPending(), "users", PENDING), { name: "a".repeat(81) })
  );
  await assertSucceeds(
    updateDoc(doc(asPending(), "users", PENDING), { name: "a".repeat(80) })
  );
});

test("registration: a name that is not a string is refused", async () => {
  await assertFails(updateDoc(doc(asPending(), "users", PENDING), { name: 7 }));
  await assertFails(updateDoc(doc(asPending(), "users", PENDING), { name: null }));
});

test("registration: naming yourself is still not approving yourself", async () => {
  await assertFails(
    updateDoc(doc(asPending(), "users", PENDING), { name: "Newcomer", status: "approved" })
  );
  await assertFails(
    updateDoc(doc(asPending(), "users", PENDING), { name: "Newcomer", role: "admin" })
  );
});

test("registration: you cannot rename somebody else", async () => {
  await assertFails(updateDoc(doc(asPending(), "users", MEMBER), { name: "Not Rizu" }));
  await assertFails(updateDoc(doc(asMember(), "users", OTHER_MEMBER), { name: "Not Tanvir" }));
});

test("registration: an approved member can still correct their own name", async () => {
  await assertSucceeds(updateDoc(doc(asMember(), "users", MEMBER), { name: "Rizu Ahmed" }));
});
