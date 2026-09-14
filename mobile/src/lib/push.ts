/**
 * Push registration.
 *
 * The token is what makes push the first rung of the chain, and push is the
 * only free, instant channel — so this runs on every approved sign-in, and
 * quietly does nothing when it cannot work.
 *
 * It cannot work in Expo Go (no FCM credentials) or in a web render, so the
 * module is loaded on demand rather than imported: a missing native module
 * must not take the app down on the way to the first screen.
 */

import { Platform } from "react-native";
import { arrayUnion, doc, setDoc } from "firebase/firestore";

import { db } from "./firebase";

/** The channel the FCM adapter sends to — they have to match. */
export const ANDROID_CHANNEL_ID = "reminders";

type Notifications = typeof import("expo-notifications");

function loadNotifications(): Notifications | null {
  try {
    return require("expo-notifications");
  } catch {
    return null;
  }
}

export type PushResult =
  | { status: "registered"; token: string }
  | { status: "unavailable"; reason: string }
  | { status: "denied" };

/**
 * Ask for permission, make sure the notification channel exists, and put the
 * device's FCM token on the user's record.
 *
 * Tokens accumulate — a person may have a phone and a tablet — and the
 * sender prunes the dead ones when they come back unregistered, which is the
 * only moment we can know.
 */
export async function registerForPush(uid: string): Promise<PushResult> {
  if (!uid) return { status: "unavailable", reason: "not signed in" };
  if (Platform.OS === "web") return { status: "unavailable", reason: "web" };

  const Notifications = loadNotifications();
  if (!Notifications) {
    return { status: "unavailable", reason: "expo-notifications is not in this build" };
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: "Task reminders",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: "#ffc20a",
        // A reminder that arrives silently is not a reminder.
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    const granted =
      existing.granted ||
      (existing.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);

    if (!granted) return { status: "denied" };

    // The device's own FCM token, not an Expo push token: the Cloud Function
    // sends through firebase-admin, which speaks FCM directly.
    const device = await Notifications.getDevicePushTokenAsync();
    const token = String(device.data);
    if (!token) return { status: "unavailable", reason: "no token issued" };

    await setDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) }, { merge: true });
    return { status: "registered", token };
  } catch (err) {
    return {
      status: "unavailable",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
