/**
 * Role resolution. Pure functions, no Firebase imports, so the rule that
 * decides who is the owner can be unit tested on its own.
 */

import { OWNER_EMAILS } from "./config";

export type Role = "owner" | "admin" | "member";
export type AccountStatus = "pending" | "approved";

export interface Access {
  role: Role;
  status: AccountStatus;
}

/** The claims written onto the ID token. Firestore rules read exactly these. */
export interface AccessClaims {
  role: Role;
  status: AccountStatus;
}

const VALID_ROLES: readonly Role[] = ["owner", "admin", "member"];
const VALID_STATUSES: readonly AccountStatus[] = ["pending", "approved"];

/**
 * True only for a verified Google address on the owner list. An unverified
 * token never qualifies, however the address is spelled: without
 * `email_verified` we have no evidence the signer controls the mailbox.
 */
export function isOwnerEmail(
  email: string | undefined | null,
  emailVerified: boolean | undefined,
  owners: readonly string[] = OWNER_EMAILS
): boolean {
  if (!email || emailVerified !== true) return false;
  const normalised = email.trim().toLowerCase();
  return owners.some((owner) => owner.trim().toLowerCase() === normalised);
}

/**
 * What a brand-new sign-in is worth. The owner address lands approved and in
 * charge; every other Google account in the world lands pending, which the
 * security rules read as "may see nothing but your own user document".
 */
export function initialAccess(
  email: string | undefined | null,
  emailVerified: boolean | undefined,
  owners: readonly string[] = OWNER_EMAILS
): Access {
  return isOwnerEmail(email, emailVerified, owners)
    ? { role: "owner", status: "approved" }
    : { role: "member", status: "pending" };
}

/**
 * Reconcile a stored user document against the owner list, and fall back to
 * least privilege on anything malformed.
 *
 * This is the invariant that keeps "exactly one owner account" true: the role
 * `owner` is only ever granted to an address on the owner list, so a stray
 * write that promotes someone to owner is demoted back to admin here, and an
 * owner whose document was tampered with is restored. It also means the owner
 * cannot lock themselves out by editing their own document.
 */
export function reconcileAccess(
  stored: { role?: unknown; status?: unknown },
  email: string | undefined | null,
  emailVerified: boolean | undefined,
  owners: readonly string[] = OWNER_EMAILS
): Access {
  if (isOwnerEmail(email, emailVerified, owners)) {
    return { role: "owner", status: "approved" };
  }

  const role = VALID_ROLES.includes(stored.role as Role)
    ? (stored.role as Role)
    : "member";
  const status = VALID_STATUSES.includes(stored.status as AccountStatus)
    ? (stored.status as AccountStatus)
    : "pending";

  // Only an owner-list address may hold the owner role.
  const safeRole: Role = role === "owner" ? "admin" : role;

  // An admin that is not approved is not an admin.
  if (safeRole === "admin" && status !== "approved") {
    return { role: "member", status: "pending" };
  }

  return { role: safeRole, status };
}

/** True when two access states differ, i.e. the token needs re-minting. */
export function accessChanged(a: Partial<Access>, b: Access): boolean {
  return a.role !== b.role || a.status !== b.status;
}

/** Best-effort display name for a fresh registration. */
export function displayNameFrom(
  name: string | undefined | null,
  email: string | undefined | null
): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) return trimmed;
  const local = (email ?? "").split("@")[0] ?? "";
  return local || "New member";
}
