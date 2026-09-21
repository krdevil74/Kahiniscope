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

import { DEFAULT_DIAL_CODE, normalisePhone } from "../lib/phone.js";

test("ten digits on their own are an Indian mobile", () => {
  for (const typed of [
    "9876543210",
    "98765 43210",
    "98765-43210",
    "09876543210",
    "919876543210",
    "+919876543210",
    "+91 98765 43210",
  ]) {
    assert.equal(normalisePhone(typed), "+919876543210", typed);
  }
});

test("all four Indian mobile prefixes are accepted", () => {
  for (const first of ["6", "7", "8", "9"]) {
    assert.equal(normalisePhone(`${first}876543210`), `+91${first}876543210`);
  }
});

test("a number already in E.164 is never touched, whatever the country", () => {
  assert.equal(normalisePhone("+8801712344192"), "+8801712344192");
  assert.equal(normalisePhone("+14155552671"), "+14155552671");
});

test("what is not a number yet", () => {
  for (const junk of [
    "", "   ", "07", "abc", "12345", "+0123456789", "++919876543210",
    "5876543210", "98765432101",
  ]) {
    assert.equal(normalisePhone(junk), null, JSON.stringify(junk));
  }
});

test("a landline-shaped number is not a mobile", () => {
  assert.equal(normalisePhone("1123456789"), null);
  assert.equal(normalisePhone("0223456789"), null);
});

test("absent is not a number either", () => {
  assert.equal(normalisePhone(null), null);
  assert.equal(normalisePhone(undefined), null);
});

test("the dial code matches the one the app's form shows", () => {
  assert.equal(DEFAULT_DIAL_CODE, "+91");
});
