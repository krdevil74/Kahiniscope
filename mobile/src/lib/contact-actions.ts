/**
 * Writing a contact.
 *
 * Every one of these is a Cloud Function call rather than a direct write. The
 * rules forbid a client creating a user document at all, and the server is
 * where a phone number is normalised and checked against everybody else's —
 * that number is the identity, so the app is not allowed to decide it.
 *
 * The shape being written, and what counts as complete, is contacts.ts.
 */

import { httpsCallable } from "firebase/functions";

import { type ContactDraft } from "./contacts.ts";
import { normalisePhone } from "./phone.ts";
import { appFunctions } from "./region.ts";

function payload(draft: ContactDraft) {
  return {
    name: draft.name.trim(),
    phone: normalisePhone(draft.phone) ?? draft.phone.trim(),
    email: draft.email.trim(),
    crafts: draft.crafts,
    preferredChannel: draft.preferredChannel,
    note: draft.note.trim(),
  };
}

export async function addContact(draft: ContactDraft): Promise<string> {
  const call = httpsCallable<ReturnType<typeof payload>, { uid: string }>(
    appFunctions(),
    "addContact"
  );
  const { data } = await call(payload(draft));
  return data.uid;
}

export async function updateContact(uid: string, draft: ContactDraft): Promise<void> {
  const call = httpsCallable<ReturnType<typeof payload> & { uid: string }, { uid: string }>(
    appFunctions(),
    "updateContact"
  );
  await call({ uid, ...payload(draft) });
}

export async function removeContact(uid: string): Promise<{ name: string; tasks: number }> {
  const call = httpsCallable<{ uid: string }, { name: string; tasks: number }>(
    appFunctions(),
    "removeContact"
  );
  const { data } = await call({ uid });
  return data;
}

/**
 * A Telegram invite for somebody with no app to tap "Connect Telegram" in.
 * Only they can create the chat id, so all an admin can do is hand them the
 * link.
 */
export async function contactTelegramLink(uid: string): Promise<string> {
  const call = httpsCallable<{ uid: string }, { url: string; name: string }>(
    appFunctions(),
    "contactTelegramLink"
  );
  const { data } = await call({ uid });
  return data.url;
}

export async function approveAndLinkContact(
  uid: string,
  contactUid: string
): Promise<{ name: string; tasks: number }> {
  const call = httpsCallable<{ uid: string; contactUid: string }, { name: string; tasks: number }>(
    appFunctions(),
    "approveAndLinkContact"
  );
  const { data } = await call({ uid, contactUid });
  return data;
}

