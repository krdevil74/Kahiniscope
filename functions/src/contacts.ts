/**
 * People who do the work but have not installed the app.
 *
 * A production runs on whoever is available, and some of them will never be
 * persuaded to install anything. An admin adds them here against a phone
 * number, and from that moment they are assignable and remindable like
 * anybody else — the board counts them, the escalation ladder chases them,
 * and reminders go out over WhatsApp or Telegram instead of push.
 *
 * They live in `users` rather than a collection of their own, so every query
 * in the app and every step of the escalation engine keeps working untouched.
 * What marks them is `accountless: true`: no Firebase Auth user exists behind
 * the document, so nothing ever signs in as them and no claim is ever minted.
 *
 * The phone number is the identity. It is normalised to E.164 here rather
 * than trusted from the client, and it is unique across every user document —
 * that uniqueness is what lets a later sign-in be recognised as the same
 * person (see linkContact).
 */

import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

import { REGION } from "./config";
import { normalisePhone } from "./phone";

/** The channels an admin can choose for somebody who has no app. */
const CONTACT_CHANNELS = ["whatsapp", "telegram", "sms"] as const;
type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** Matches the app's MAX_CRAFTS. */
const MAX_CRAFTS = 5;

interface ContactInput {
  name?: string;
  phone?: string;
  email?: string | null;
  crafts?: string[];
  preferredChannel?: string | null;
  note?: string | null;
}

interface ContactRequest extends ContactInput {
  /** Present when editing; absent when adding. */
  uid?: string;
}

function assertAdmin(auth: { token?: Record<string, unknown> } | undefined): void {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const role = auth.token?.role;
  if ((role !== "admin" && role !== "owner") || auth.token?.status !== "approved") {
    throw new HttpsError("permission-denied", "Only an admin can manage contacts.");
  }
}

function cleanCrafts(crafts: unknown): string[] {
  if (!Array.isArray(crafts)) return [];
  const cleaned = crafts
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim().slice(0, 40));
  return Array.from(new Set(cleaned)).slice(0, MAX_CRAFTS);
}

function cleanChannel(value: unknown): ContactChannel | null {
  return CONTACT_CHANNELS.includes(value as ContactChannel)
    ? (value as ContactChannel)
    : null;
}

function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new HttpsError("invalid-argument", "A name is required.");
  return name.slice(0, 80);
}

function cleanEmail(value: unknown): string {
  // Optional by design: most of these people are a phone number and nothing
  // else. Stored lowercase so a later sign-in compares cleanly.
  if (typeof value !== "string" || !value.trim()) return "";
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "That email address is not valid.");
  }
  return email.slice(0, 120);
}

/**
 * One number, one person. Checked across every user document rather than
 * only the contacts, because an app account and a contact sharing a number
 * are the same human being — and that is exactly the case linkContact exists
 * to resolve.
 */
async function assertPhoneIsFree(phone: string, exceptUid?: string): Promise<void> {
  const clash = await getFirestore()
    .collection("users")
    .where("phone", "==", phone)
    .limit(2)
    .get();

  const other = clash.docs.find((doc) => doc.id !== exceptUid);
  if (!other) return;

  const name = other.data()?.name ?? "somebody";
  throw new HttpsError(
    "already-exists",
    other.data()?.accountless === true
      ? `${name} is already on the team with that number.`
      : `${name} already has an account with that number — assign the work to them instead.`
  );
}

export const addContact = onCall<ContactRequest>({ region: REGION }, async (request) => {
  assertAdmin(request.auth);

  const name = cleanName(request.data?.name);
  const phone = normalisePhone(request.data?.phone);
  if (!phone) {
    throw new HttpsError("invalid-argument", "That does not look like a phone number.");
  }
  const email = cleanEmail(request.data?.email);
  const crafts = cleanCrafts(request.data?.crafts);
  const preferredChannel = cleanChannel(request.data?.preferredChannel);

  await assertPhoneIsFree(phone);

  const db = getFirestore();
  const ref = db.collection("users").doc();

  await ref.set({
    name,
    email,
    phone,
    telegramChatId: null,
    crafts,
    // Approved on arrival: an admin typing somebody in *is* the approval.
    // There is no account to hold in a queue and nobody to show a holding
    // screen to.
    status: "approved",
    role: "member",
    fcmTokens: [],
    note: typeof request.data?.note === "string" ? request.data.note.trim().slice(0, 500) : null,
    preferredChannel,
    accountless: true,
    addedBy: request.auth?.uid ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info("Contact added", { uid: ref.id, by: request.auth?.uid });
  return { uid: ref.id };
});

export const updateContact = onCall<ContactRequest>({ region: REGION }, async (request) => {
  assertAdmin(request.auth);

  const uid = request.data?.uid;
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "A contact is required.");
  }

  const db = getFirestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) throw new HttpsError("not-found", "That person is no longer on the team.");
  if (snap.data()?.accountless !== true) {
    // An account holder owns their own profile; an admin changing a name or
    // a number underneath them would be editing somebody's identity.
    throw new HttpsError(
      "failed-precondition",
      "That person has an account of their own — they maintain their own details."
    );
  }

  const patch: Record<string, unknown> = {};

  if (request.data?.name !== undefined) patch.name = cleanName(request.data.name);
  if (request.data?.email !== undefined) patch.email = cleanEmail(request.data.email);
  if (request.data?.crafts !== undefined) patch.crafts = cleanCrafts(request.data.crafts);
  if (request.data?.preferredChannel !== undefined) {
    patch.preferredChannel = cleanChannel(request.data.preferredChannel);
  }
  if (request.data?.note !== undefined) {
    patch.note =
      typeof request.data.note === "string" ? request.data.note.trim().slice(0, 500) : null;
  }
  if (request.data?.phone !== undefined) {
    const phone = normalisePhone(request.data.phone);
    if (!phone) throw new HttpsError("invalid-argument", "That does not look like a phone number.");
    await assertPhoneIsFree(phone, uid);
    patch.phone = phone;
    // A new number is a new person as far as Telegram is concerned.
    if (phone !== snap.data()?.phone) patch.telegramChatId = null;
  }

  if (Object.keys(patch).length === 0) return { uid };

  await ref.set(patch, { merge: true });
  logger.info("Contact updated", { uid, by: request.auth?.uid, fields: Object.keys(patch) });
  return { uid };
});

/**
 * A Telegram invite for somebody who has no app to tap "Connect Telegram" in.
 *
 * The chat id can only come from Telegram itself, so there is nothing an
 * admin could usefully type: the only way in is for this person to open the
 * bot. The token is the same single-use mechanism the app's own linkTelegram
 * uses, and the same webhook consumes it — a contact document sitting in
 * `users` is found by exactly the same query.
 */
export const contactTelegramLink = onCall<{ uid?: string }>(
  { region: REGION },
  async (request) => {
    assertAdmin(request.auth);

    const username = process.env.TELEGRAM_BOT_USERNAME ?? "";
    if (!username) {
      throw new HttpsError("failed-precondition", "The Telegram bot is not set up yet.");
    }

    const uid = request.data?.uid;
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "A contact is required.");
    }

    const ref = getFirestore().collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "That person is no longer on the team.");

    const token = randomUUID().replace(/-/g, "");
    await ref.set(
      { telegramLinkToken: token, telegramLinkedAt: Timestamp.now() },
      { merge: true }
    );

    return { url: `https://t.me/${username}?start=${token}`, name: snap.data()?.name ?? "" };
  }
);

/**
 * Remove a contact. Their open tasks go with them, because a task assigned to
 * nobody is worse than no task: it sits on the board being counted and
 * chased, and no reminder can reach anyone.
 */
export const removeContact = onCall<{ uid?: string }>({ region: REGION }, async (request) => {
  assertAdmin(request.auth);

  const uid = request.data?.uid;
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "A contact is required.");
  }

  const db = getFirestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) throw new HttpsError("not-found", "That person is already gone.");
  if (snap.data()?.accountless !== true) {
    throw new HttpsError(
      "failed-precondition",
      "That person has an account — revoke their access instead of deleting them."
    );
  }

  const tasks = await db.collection("tasks").where("assigneeUid", "==", uid).get();
  const batch = db.batch();
  tasks.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(ref);
  await batch.commit();

  logger.info("Contact removed", { uid, tasks: tasks.size, by: request.auth?.uid });
  return { name: snap.data()?.name ?? "", tasks: tasks.size };
});

/**
 * The moment a contact becomes an account.
 *
 * Somebody an admin typed in months ago finally installs the app and signs in
 * with Google. They arrive as a fresh pending registration with the same
 * phone number as a contact already carrying their work. Approving them
 * normally would leave two records for one person, the tasks on the wrong
 * one, and reminders still going to WhatsApp.
 *
 * This is the same approval, plus the merge: the tasks move to the real
 * account, what the admin knew about them carries over, the contact record
 * goes, and the account is approved in the same commit.
 *
 * It is deliberately an admin action rather than something that happens by
 * itself on registration. A phone number typed into a form is a claim, not a
 * proof — anyone who knows a number could otherwise inherit that person's
 * work by typing it. The admin looking at both records is the check.
 */
export const approveAndLinkContact = onCall<{ uid?: string; contactUid?: string }>(
  { region: REGION },
  async (request) => {
    assertAdmin(request.auth);

    const uid = request.data?.uid;
    const contactUid = request.data?.contactUid;
    if (!uid || typeof uid !== "string" || !contactUid || typeof contactUid !== "string") {
      throw new HttpsError("invalid-argument", "A registration and a contact are required.");
    }
    if (uid === contactUid) {
      throw new HttpsError("invalid-argument", "Those are the same record.");
    }

    const db = getFirestore();
    const accountRef = db.collection("users").doc(uid);
    const contactRef = db.collection("users").doc(contactUid);
    const [account, contact] = await db.getAll(accountRef, contactRef);

    if (!account.exists) throw new HttpsError("not-found", "That registration is gone.");
    if (!contact.exists) throw new HttpsError("not-found", "That contact is gone.");

    const accountData = account.data() ?? {};
    const contactData = contact.data() ?? {};

    if (accountData.accountless === true) {
      throw new HttpsError("failed-precondition", "Neither of those is a real account.");
    }
    if (contactData.accountless !== true) {
      throw new HttpsError(
        "failed-precondition",
        "That is somebody's own account, not a contact. Two accounts cannot be merged here."
      );
    }

    // The phones must still agree. The admin saw a match on screen; between
    // then and now either record could have been edited.
    const accountPhone = normalisePhone(accountData.phone as string | null);
    const contactPhone = normalisePhone(contactData.phone as string | null);
    if (!accountPhone || !contactPhone || accountPhone !== contactPhone) {
      throw new HttpsError(
        "failed-precondition",
        "Those two no longer share a phone number. Check both records."
      );
    }

    const tasks = await db.collection("tasks").where("assigneeUid", "==", contactUid).get();
    // A batch is 500 writes; the two user writes and the delete need three of
    // them. Nobody has 497 open tasks, but failing loudly beats a silent
    // half-merge.
    if (tasks.size > 490) {
      throw new HttpsError(
        "failed-precondition",
        "That contact has too many tasks to move in one go. Close some first."
      );
    }

    const crafts = Array.from(
      new Set([...cleanCrafts(accountData.crafts), ...cleanCrafts(contactData.crafts)])
    ).slice(0, MAX_CRAFTS);

    const batch = db.batch();
    tasks.docs.forEach((doc) => batch.update(doc.ref, { assigneeUid: uid }));

    batch.set(
      accountRef,
      {
        crafts,
        // What the admin chose for them still holds; push will simply win the
        // chain now that there is a device.
        preferredChannel: accountData.preferredChannel ?? contactData.preferredChannel ?? null,
        // A linked Telegram chat is theirs, and worth keeping: they are the
        // same person and the chat is already proven.
        telegramChatId: accountData.telegramChatId ?? contactData.telegramChatId ?? null,
        note: accountData.note || contactData.note || null,
        linkedFromContact: contactUid,
        // The approval itself. The claim-sync trigger takes it from here.
        status: "approved",
      },
      { merge: true }
    );

    batch.delete(contactRef);
    await batch.commit();

    logger.info("Registration approved and linked to a contact", {
      uid,
      contactUid,
      tasks: tasks.size,
      by: request.auth?.uid,
    });

    return { name: accountData.name ?? "", tasks: tasks.size };
  }
);
