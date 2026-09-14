/**
 * Connecting a member's Telegram.
 *
 * The bot cannot know who is typing at it, so the app mints a one-time token,
 * puts it on the member's own record, and sends them to
 * t.me/<bot>?start=<token>. The webhook matches the token and writes the chat
 * id back. The token is single use and short-lived.
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { REGION } from "./config";

/**
 * The bot's @name, e.g. "KahiniscopeBot". Not a secret, so it lives in
 * functions/.env rather than in Secret Manager:
 *
 *   TELEGRAM_BOT_USERNAME=KahiniscopeBot
 *
 * Read from the environment rather than declared with defineString(), because
 * a declared parameter without a value prompts on the terminal — which hangs
 * the emulator, and anything else running unattended.
 */
function botUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME ?? "";
}

export const linkTelegram = onCall({ region: REGION }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (auth.token?.status !== "approved") {
    throw new HttpsError("permission-denied", "Your registration has not been approved yet.");
  }

  const username = botUsername();
  if (!username) {
    throw new HttpsError("failed-precondition", "The Telegram bot is not set up yet.");
  }

  // Telegram's start parameter allows [A-Za-z0-9_-] only.
  const token = randomUUID().replace(/-/g, "");

  await getFirestore().collection("users").doc(auth.uid).set(
    { telegramLinkToken: token, telegramLinkedAt: Timestamp.now() },
    { merge: true }
  );

  return { url: `https://t.me/${username}?start=${token}` };
});
