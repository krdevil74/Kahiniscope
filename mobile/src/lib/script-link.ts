/**
 * The script link on an episode.
 *
 * An admin pastes a Google Drive share link and everyone with a task on that
 * episode gets a way to open it. Two things are checked before it is stored:
 *
 *   1. It is https. A pasted http link would be opened by a phone as-is.
 *   2. It is a Google host. The admin is pasting into a field that members
 *      will tap without looking; accepting any URL would turn an episode
 *      into a redirect anybody on the team follows on trust. The ask was a
 *      Drive PDF, so Drive is what is accepted.
 *
 * No Firebase imports, so both checks can be tested directly.
 */

/** Hosts a share link can legitimately come from. */
const DRIVE_HOSTS: readonly string[] = [
  "drive.google.com",
  "docs.google.com",
  "drive.usercontent.google.com",
];

export interface ScriptLinkError {
  ok: false;
  reason: string;
}

export interface ScriptLinkOk {
  ok: true;
  url: string;
}

export type ScriptLinkResult = ScriptLinkOk | ScriptLinkError;

/**
 * Validates and normalises what was typed. Returns the reason on failure
 * rather than a boolean, because the field shows it verbatim and a person
 * pasting the wrong thing deserves to be told which wrong thing it was.
 */
export function parseScriptLink(raw: string): ScriptLinkResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Paste the Drive link to the script." };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "That is not a link. Copy it from Drive's Share button." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "The link has to start with https://." };
  }

  if (!DRIVE_HOSTS.includes(url.hostname.toLowerCase())) {
    return { ok: false, reason: "Only Google Drive links are accepted here." };
  }

  return { ok: true, url: url.toString() };
}

export function isScriptLink(raw: string): boolean {
  return parseScriptLink(raw).ok;
}

/**
 * The Drive file id, when the link carries one in a shape we recognise:
 *
 *   /file/d/<id>/view      the Share button's link
 *   ?id=<id>               older download links
 *
 * Used only to label the row, so an unrecognised shape is not an error.
 */
export function driveFileId(url: string): string | null {
  const parsed = parseScriptLink(url);
  if (!parsed.ok) return null;

  const path = new URL(parsed.url);
  const segments = path.pathname.split("/").filter(Boolean);
  const d = segments.indexOf("d");
  if (d >= 0 && segments[d + 1]) return segments[d + 1];

  return path.searchParams.get("id");
}

/** What the member's row says under "Script". */
export function scriptRowLabel(url: string): string {
  const id = driveFileId(url);
  return id ? `Drive · ${id.slice(0, 8)}…` : "Open in Drive";
}
