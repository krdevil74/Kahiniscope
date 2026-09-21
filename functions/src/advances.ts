/**
 * Paying somebody before the work exists.
 *
 * An artist who is about to record twelve episodes may want money now, and
 * that money cannot be attached to a task because none of the tasks have been
 * done yet. So it sits on their record as a balance, and approving their work
 * spends it.
 *
 * Two things this is careful about:
 *
 * The balance is server-owned. It is not in any rule a client can satisfy,
 * which means the only way it moves is through here or through an approval —
 * and both are transactions, because the balance is precisely the field two
 * admins could race on.
 *
 * Every advance is also its own document. "Where did this balance come from"
 * is a question somebody will ask, and a bare total cannot answer it.
 */

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

import { REGION } from "./config";
import { advanceBody, advanceShort } from "./messaging/copy";
import { notifyMember } from "./notify-member";
import { TELEGRAM_BOT_TOKEN } from "./messaging/telegram";
import { TEXTBELT_KEY, WHATSAPP_PHONE_ID, WHATSAPP_TOKEN } from "./messaging/pending-channels";

interface AdvanceRequest {
  uid?: string;
  amount?: number;
  note?: string | null;
}

function assertAdmin(auth: { token?: Record<string, unknown> } | undefined): void {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const role = auth.token?.role;
  if ((role !== "admin" && role !== "owner") || auth.token?.status !== "approved") {
    throw new HttpsError("permission-denied", "Only an admin can advance money.");
  }
}

export const addAdvance = onCall<AdvanceRequest>(
  {
    region: REGION,
    secrets: [TELEGRAM_BOT_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, TEXTBELT_KEY],
  },
  async (request) => {
    assertAdmin(request.auth);

    const uid = request.data?.uid;
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "Somebody has to be advanced the money.");
    }

    const amount = request.data?.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpsError("invalid-argument", "How much is being advanced?");
    }
    const rounded = Math.round(amount);

    const note =
      typeof request.data?.note === "string" && request.data.note.trim()
        ? request.data.note.trim().slice(0, 300)
        : null;

    const db = getFirestore();
    const userRef = db.collection("users").doc(uid);
    const advanceRef = db.collection("advances").doc();

    const balance = await db.runTransaction(async (tx) => {
      const user = await tx.get(userRef);
      if (!user.exists) throw new HttpsError("not-found", "That person is not on the team.");

      const current = Number(user.data()?.balance ?? 0);
      const next = (Number.isFinite(current) && current > 0 ? current : 0) + rounded;

      tx.set(advanceRef, {
        uid,
        amount: rounded,
        note,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: request.auth?.uid ?? null,
      });
      tx.set(userRef, { balance: next }, { merge: true });

      return { next, name: String(user.data()?.name ?? "") };
    });

    logger.info("Advance paid", { uid, amount: rounded, balance: balance.next, by: request.auth?.uid });

    await notifyMember(uid, {
      short: advanceShort(rounded),
      body: advanceBody(balance.name, rounded, balance.next, note),
    });

    return { advanceId: advanceRef.id, balance: balance.next };
  }
);
