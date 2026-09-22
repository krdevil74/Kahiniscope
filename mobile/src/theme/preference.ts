/**
 * Which theme a setting means.
 *
 * Kept apart from theme.tsx so it can be tested without a React Native
 * runtime — the provider imports useColorScheme and AsyncStorage, neither of
 * which exists in a test process.
 *
 * Pure: no React, no storage. Unit tested.
 */

export type ThemePreference = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * An explicit choice wins. "System" follows the phone — and when the phone
 * will not say (some Androids report "unspecified"), it falls to dark, which
 * is the theme this palette was drawn for rather than a guess at light.
 */
export function resolveScheme(
  preference: ThemePreference,
  system: string | null | undefined
): ColorScheme {
  if (preference === "light" || preference === "dark") return preference;
  return system === "light" ? "light" : "dark";
}
