/**
 * The approval queue's three actions.
 *
 * Approve and revoke are direct writes: the rules let an admin change
 * `status` and nothing else, so they land immediately and the member's app
 * reacts on the next snapshot. Decline goes through a Cloud Function, because
 * it deletes the account as well as the document.
 */

import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { appFunctions } from "./region.ts";

import { db } from "./firebase";
import { normaliseName } from "./format.ts";
import type { TeamMember } from "./model";

/** Functions live in the same region as Firestore. */

export async function approveRegistration(member: TeamMember): Promise<void> {
  await updateDoc(doc(db, "users", member.uid), { status: "approved" });
}

/**
 * Back into the queue. Deliberately not a deletion: a revoked account keeps
 * its history and can be let back in with one tap.
 */
export async function revokeAccess(member: TeamMember): Promise<void> {
  await updateDoc(doc(db, "users", member.uid), { status: "pending" });
}

/**
 * Which channel an admin wants this person reminded on. The rules allow an
 * admin exactly two fields on somebody else's record — this and `status`.
 */
export async function setPreferredChannel(
  uid: string,
  channel: string | null
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { preferredChannel: channel });
}

/**
 * Keeping somebody's crafts right. The rules allow an admin exactly three
 * fields on another person's record — this, the channel, and status — so the
 * person page can record "she does the voices as well now" without a
 * round trip through a Cloud Function.
 */
export async function setCrafts(uid: string, crafts: string[]): Promise<void> {
  await updateDoc(doc(db, "users", uid), { crafts });
}

export async function declineRegistration(member: TeamMember): Promise<void> {
  const call = httpsCallable<{ uid: string }, { name: string }>(appFunctions(), "declineRegistration");
  await call({ uid: member.uid });
}

/** An applicant completing their own registration — the one write they may make. */
export async function submitRegistration(
  uid: string,
  details: { name?: string; phone: string; crafts: string[]; note: string }
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    ...(details.name ? { name: normaliseName(details.name) } : {}),
    phone: details.phone,
    crafts: details.crafts,
    note: details.note || null,
  });
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export function approvedToast(name: string, crafts: string[]): string {
  return `${name} approved as ${crafts.length ? crafts.join(" · ") : "member"} — dashboard unlocked`;
}

export function declinedToast(name: string): string {
  return `${name} declined`;
}

export function channelPinnedToast(name: string, label: string | null): string {
  return label
    ? `${name} will be reminded on ${label} first`
    : `${name} goes back to whatever reaches them first`;
}

export function revokedToast(name: string): string {
  return `${name}'s access revoked — back in the approval queue`;
}
