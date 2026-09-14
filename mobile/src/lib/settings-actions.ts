/**
 * Writes to settings/global, and the role callable.
 *
 * Every one of these is owner-only. The security rules enforce it
 * independently — `allow write: if isOwner()` on settings, and a callable that
 * checks the owner claim for roles — so the gating in the UI is a courtesy,
 * not the boundary.
 */

import { doc, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

import { app, db } from "./firebase";
import type { ChannelId, QuietHours } from "./model";

const functions = getFunctions(app, "asia-south1");
const settingsRef = () => doc(db, "settings", "global");

/** The escalation ladder. Every countdown in the app recalculates from it. */
export async function savePlan(plan: number[]): Promise<void> {
  await setDoc(settingsRef(), { plan }, { merge: true });
}

export async function saveChannel(channel: ChannelId | "email", on: boolean): Promise<void> {
  await setDoc(settingsRef(), { channels: { [channel]: on } }, { merge: true });
}

export async function saveQuietHours(quietHours: Partial<QuietHours>): Promise<void> {
  await setDoc(settingsRef(), { quietHours }, { merge: true });
}

export async function setMemberRole(uid: string, role: "admin" | "member"): Promise<string> {
  const call = httpsCallable<{ uid: string; role: string }, { name: string }>(
    functions,
    "setMemberRole"
  );
  const result = await call({ uid, role });
  return result.data.name;
}

export function roleToast(name: string, role: "admin" | "member"): string {
  return role === "admin" ? `${name} is now an admin` : `${name} is back to member access`;
}
