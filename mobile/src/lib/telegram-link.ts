/**
 * Connecting a member's Telegram.
 *
 * The bot has no idea who is typing at it, so the server mints a one-time
 * token and hands back a t.me link carrying it. Opening that link and pressing
 * Start is the whole of the setup — the webhook matches the token and writes
 * the chat id back, and reminders start arriving there.
 */

import { Linking } from "react-native";
import { httpsCallable } from "firebase/functions";

import { appFunctions } from "./region.ts";



export async function connectTelegram(): Promise<void> {
  const call = httpsCallable<Record<string, never>, { url: string }>(appFunctions(), "linkTelegram");
  const { data } = await call({});
  const opened = await Linking.canOpenURL(data.url);
  if (!opened) throw new Error("Telegram is not installed on this phone.");
  await Linking.openURL(data.url);
}
