/**
 * Bengali script detection.
 *
 * Episode titles are Bengali and the interface is English, in the same list,
 * often in the same card. Space Grotesk has no Bengali coverage, and React
 * Native on Android will not fall back per-glyph inside a styled Text — it
 * renders tofu. So every string is checked and given the font that can draw
 * it.
 *
 * Deliberately free of imports: it is unit tested directly by the Node test
 * runner, which resolves TypeScript but not Metro's extensionless specifiers.
 */

/** Bengali block, U+0980–U+09FF. Covers the script and its digits ০–৯. */
const BENGALI = /[ঀ-৿]/;

export function containsBengali(text: unknown): boolean {
  return typeof text === "string" && BENGALI.test(text);
}

/**
 * Where a string sits on the one decision that matters for font choice.
 * "mixed" is treated exactly like "bengali": one Text gets one family, and
 * the family that can draw every glyph is the Bengali one.
 */
export type Script = "latin" | "bengali";

export function scriptOf(text: unknown): Script {
  return containsBengali(text) ? "bengali" : "latin";
}
