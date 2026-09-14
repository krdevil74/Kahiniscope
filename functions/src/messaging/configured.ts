/**
 * Is a secret actually set?
 *
 * Every secret a function declares must exist in Secret Manager before that
 * function can deploy — there is no such thing as an optional declared
 * secret. So a project that has not set up WhatsApp yet still needs a
 * WHATSAPP_TOKEN to exist, and the honest thing to put in it is a placeholder.
 *
 * `unset` is that placeholder, and it is treated here as exactly what it is:
 * not configured. Without this a placeholder would read as a credential, and
 * the adapter would try to use it and fail somewhere far less obvious.
 */

const PLACEHOLDERS = new Set(["", "unset", "UNSET", "none", "changeme", "todo"]);

export function isConfigured(value: string | undefined | null): boolean {
  return typeof value === "string" && !PLACEHOLDERS.has(value.trim());
}

/** Reads a declared secret, tolerating one that is not bound at all. */
export function readSecret(
  secret: { value: () => string },
  envName: string
): string {
  let raw = "";
  try {
    raw = secret.value();
  } catch {
    raw = "";
  }
  const value = raw || process.env[envName] || "";
  return isConfigured(value) ? value : "";
}
