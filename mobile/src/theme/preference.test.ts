import assert from "node:assert/strict";
import test from "node:test";

import { isThemePreference, resolveScheme } from "./preference.ts";

test("an explicit choice beats whatever the phone says", () => {
  assert.equal(resolveScheme("light", "dark"), "light");
  assert.equal(resolveScheme("dark", "light"), "dark");
});

test("System follows the phone", () => {
  assert.equal(resolveScheme("system", "light"), "light");
  assert.equal(resolveScheme("system", "dark"), "dark");
});

test("a phone that will not say gets the theme the palette was drawn for", () => {
  // Some Androids report "unspecified" rather than null.
  for (const nothing of [null, undefined, "unspecified", ""]) {
    assert.equal(resolveScheme("system", nothing), "dark", JSON.stringify(nothing));
  }
});

test("only the three settings are settings", () => {
  for (const good of ["light", "dark", "system"]) assert.equal(isThemePreference(good), true);
  for (const bad of ["", "auto", null, undefined, 1, {}]) {
    assert.equal(isThemePreference(bad), false, JSON.stringify(bad));
  }
});

test("junk in storage does not become a theme", () => {
  // The stored value is whatever was on the device; a build that once wrote
  // something else must not put the app into a state it cannot render.
  assert.equal(isThemePreference("Dark"), false);
});
