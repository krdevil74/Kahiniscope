/**
 * The server's own reading of a phone number.
 *
 * Deliberately the same examples as mobile/src/lib/phone.test.ts: the two
 * implementations are separate on purpose — the server must not trust what
 * the client normalised — but they must never disagree, because a contact's
 * number is the key a later account is matched against.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalisePhone } from "../lib/phone.js";

test("the number from the design, however it is typed", () => {
  for (const typed of [
    "+8801712344192",
    "+880 1712 344192",
    "+880-1712-344192",
    "01712344192",
    "01712-344192",
    "8801712344192",
  ]) {
    assert.equal(normalisePhone(typed), "+8801712344192", typed);
  }
});

test("other countries are left as they are", () => {
  assert.equal(normalisePhone("+919876543210"), "+919876543210");
  assert.equal(normalisePhone("+14155552671"), "+14155552671");
});

test("what is not a number yet", () => {
  for (const junk of ["", "   ", "07", "abc", "12345", "+0123456789", "++8801712344192"]) {
    assert.equal(normalisePhone(junk), null, JSON.stringify(junk));
  }
});

test("absent is not a number either", () => {
  assert.equal(normalisePhone(null), null);
  assert.equal(normalisePhone(undefined), null);
});
