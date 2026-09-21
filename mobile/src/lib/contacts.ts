/**
 * People an admin adds by hand, because they do the work and will never
 * install anything: what one of them is, and what is still missing from one
 * being typed in.
 *
 * The writes themselves live in contact-actions.ts, because every one of them
 * goes through a Cloud Function — the security rules forbid creating a user
 * document from a client, which is what keeps the account/no-account
 * distinction honest. Keeping the rules of the shape here, away from the
 * Firebase client, is what makes them testable.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

import type { ChannelId, TeamMember } from "./model.ts";
import { normalisePhone } from "./phone.ts";

export interface ContactDraft {
  name: string;
  phone: string;
  email: string;
  crafts: string[];
  /** Null means "whatever reaches them" — the chain decides. */
  preferredChannel: ChannelId | null;
  note: string;
}

export const EMPTY_CONTACT: ContactDraft = {
  name: "",
  phone: "",
  email: "",
  crafts: [],
  preferredChannel: "whatsapp",
  note: "",
};

/** The channels that can reach somebody with no app. Push cannot: no device. */
export const CONTACT_CHANNELS: ChannelId[] = ["whatsapp", "telegram", "sms"];

export function contactFrom(member: TeamMember): ContactDraft {
  return {
    name: member.name,
    phone: member.phone ?? "",
    email: member.email ?? "",
    crafts: member.crafts,
    preferredChannel: member.preferredChannel,
    note: member.note ?? "",
  };
}

/** What is still missing, so the button can say so instead of going grey. */
export function missingFromContact(draft: ContactDraft): string | null {
  if (!draft.name.trim()) return "Add a name";
  if (!normalisePhone(draft.phone)) return "Add a phone number";
  if (draft.crafts.length === 0) return "Pick what they do";
  return null;
}

export function isContactComplete(draft: ContactDraft): boolean {
  return missingFromContact(draft) === null;
}

// ---------------------------------------------------------------------------
// Recognising somebody who was already on the team
// ---------------------------------------------------------------------------

/**
 * The contact a pending registration looks like.
 *
 * Somebody an admin typed in months ago finally installs the app: same
 * person, same number, two records. Matching is on the normalised phone and
 * nothing else — a name is spelled three ways and an email is usually absent,
 * but the number is what the admin used as the identity in the first place.
 *
 * This only ever suggests. The merge is an admin decision, because a number
 * typed into a form is a claim rather than a proof.
 *
 * Pure: no Firebase, no React. Unit tested.
 */
export function matchingContactFor(
  applicant: Pick<TeamMember, "uid" | "phone">,
  team: readonly TeamMember[]
): TeamMember | null {
  const phone = normalisePhone(applicant.phone ?? "");
  if (!phone) return null;

  return (
    team.find(
      (member) =>
        member.accountless &&
        member.uid !== applicant.uid &&
        normalisePhone(member.phone ?? "") === phone
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export function contactAddedToast(name: string): string {
  return `${name} added — assignable now, reminders go to their phone`;
}

export function contactRemovedToast(name: string, tasks: number): string {
  return tasks === 0
    ? `${name} removed`
    : `${name} removed, along with ${tasks} open ${tasks === 1 ? "task" : "tasks"}`;
}

/**
 * What the admin is being asked to agree to. The number of open tasks is the
 * whole point of the sentence: it is what moves if they say yes, and what
 * strands on an unreachable record if they say no.
 */
export function contactMatchNote(name: string, openTasks: number): string {
  const work =
    openTasks === 0
      ? "nothing open"
      : `${openTasks} open ${openTasks === 1 ? "task" : "tasks"}`;
  return `This number is already on the team as ${name}, with ${work}. Linking moves that work onto this account and keeps one record for them.`;
}

export function linkedToast(name: string, tasks: number): string {
  return tasks === 0
    ? `${name} approved — their contact record was merged in`
    : `${name} approved — ${tasks} ${tasks === 1 ? "task" : "tasks"} moved to their account`;
}
