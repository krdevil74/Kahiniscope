/**
 * How a reminder behaves once it reaches the phone.
 *
 * Android shows a pushed notification by itself when the app is in the
 * background or closed. In the foreground it does not — the app is expected
 * to decide — so the handler below says: show it anyway. A reminder that is
 * silent because the person happened to have the app open is a reminder that
 * did not work.
 *
 * Loaded on demand, like push registration: the native module is absent in
 * Expo Go and in a web render, and that must not take the app down.
 */

import { useEffect } from "react";
import { useRouter } from "expo-router";

type Notifications = typeof import("expo-notifications");

function loadNotifications(): Notifications | null {
  try {
    return require("expo-notifications");
  } catch {
    return null;
  }
}

let handlerInstalled = false;

/** Show reminders in the foreground too: banner, sound, and a badge. */
export function installNotificationHandler(): void {
  if (handlerInstalled) return;
  const Notifications = loadNotifications();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  handlerInstalled = true;
}

/**
 * Tapping a reminder should land on the thing it is about.
 *
 * A member goes to their task list, which is where the Mark done button is.
 * An admin goes to the person who owes the work. Both are one screen from
 * doing something about it, which is the only reason to tap a reminder.
 */
export function useNotificationTaps(isAdmin: boolean): void {
  const router = useRouter();

  useEffect(() => {
    const Notifications = loadNotifications();
    if (!Notifications) return;

    installNotificationHandler();

    const open = (response: { notification: { request: { content: { data?: unknown } } } }) => {
      const data = (response.notification.request.content.data ?? {}) as {
        uid?: string;
      };
      if (isAdmin && data.uid) router.push(`/person/${data.uid}`);
      else if (!isAdmin) router.push("/my-tasks");
    };

    // A tap that opened the app from cold arrives as the last response.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) open(response);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [router, isAdmin]);
}
