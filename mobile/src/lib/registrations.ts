/**
 * The approval queue's three actions.
 *
 * Approve and revoke are direct writes: the rules let an admin change
 * `status` and nothing else, so they land immediately and the member's app
 * reacts on the next snapshot. Decline goes through a Cloud Function, because
 * it deletes the account as well as the document.
 */

import { doc, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

import { app, db } from "./firebase";
import type { TeamMember } from "./model";

/** Functions live in the same region as Firestore. */
const functions = getFunctions(app, "asia-south1");

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

export async function declineRegistration(member: TeamMember): Promise<void> {
  const call = httpsCallable<{ uid: string }, { name: string }>(functions, "declineRegistration");
  await call({ uid: member.uid });
}

/** An applicant completing their own registration — the one write they may make. */
export async function submitRegistration(
  uid: string,
  details: { name?: string; phone: string; craft: string; note: string }
): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    ...(details.name ? { name: details.name } : {}),
    phone: details.phone,
    craft: details.craft,
    note: details.note || null,
  });
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export function approvedToast(name: string, craft: string | null): string {
  return `${name} approved as ${craft ?? "member"} — dashboard unlocked`;
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
