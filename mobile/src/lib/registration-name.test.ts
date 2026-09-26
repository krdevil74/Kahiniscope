import test from "node:test";
import assert from "node:assert/strict";

import { MAX_NAME, isNameValid, normaliseName } from "./format.ts";

test("a name typed normally is left alone", () => {
  assert.equal(normaliseName("Rizu Ahmed"), "Rizu Ahmed");
});

test("a pasted name is tidied rather than rejected", () => {
  // Pasting off a chat message is at least as common as typing, and the
  // result goes straight into a chip on the admin's screen.
  assert.equal(normaliseName("  Rizu   Ahmed \n"), "Rizu Ahmed");
  assert.equal(normaliseName("Rizu\tAhmed"), "Rizu Ahmed");
});

test("a Bengali name survives intact", () => {
  assert.equal(normaliseName("রিজু আহমেদ"), "রিজু আহমেদ");
  assert.equal(isNameValid("রিজু আহমেদ"), true);
});

test("one word is a name", () => {
  // Mononyms exist, and refusing them would be refusing a person their name.
  assert.equal(isNameValid("Rizu"), true);
  assert.equal(normaliseName("Rizu"), "Rizu");
});

test("nothing at all is not a name", () => {
  for (const raw of ["", "   ", "\n\t "]) {
    assert.equal(isNameValid(raw), false, JSON.stringify(raw));
    assert.equal(normaliseName(raw), "");
  }
});

test("a name is cut to the cap the rules also enforce", () => {
  const long = "a".repeat(MAX_NAME + 40);
  assert.equal(normaliseName(long).length, MAX_NAME);
  assert.equal(isNameValid(long), true);
});

test("the cut happens after tidying, not before", () => {
  // Otherwise leading spaces would eat into the budget and a name just under
  // the cap would come back truncated.
  const padded = `   ${"b".repeat(MAX_NAME)}   `;
  assert.equal(normaliseName(padded), "b".repeat(MAX_NAME));
});

test("null and undefined are empty, not a crash", () => {
  assert.equal(normaliseName(undefined as unknown as string), "");
  assert.equal(isNameValid(null as unknown as string), false);
});
