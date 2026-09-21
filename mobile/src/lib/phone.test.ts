import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_DIAL_CODE,
  isPhoneValid,
  limitNationalInput,
  nationalDigits,
  normalisePhone,
} from "./phone.ts";

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
  // Records written before this team was all-India carry these, and reading
  // one back must not corrupt it.
  assert.equal(normalisePhone("+8801712344192"), "+8801712344192");
  assert.equal(normalisePhone("+14155552671"), "+14155552671");
});

test("what is not a number yet", () => {
  for (const junk of [
    "",
    "   ",
    "07",
    "abc",
    "12345",
    "+0123456789",
    "++919876543210",
    "5876543210",
    "98765432101",
  ]) {
    assert.equal(normalisePhone(junk), null, JSON.stringify(junk));
    assert.equal(isPhoneValid(junk), false);
  }
});

test("a landline-shaped number is not a mobile", () => {
  // Reminders go out over WhatsApp and SMS; a number that cannot receive
  // either is worse than no number.
  assert.equal(normalisePhone("1123456789"), null);
  assert.equal(normalisePhone("0223456789"), null);
});

test("a half-typed number is not treated as valid", () => {
  assert.equal(isPhoneValid("98765"), false);
  assert.equal(isPhoneValid("987654321"), false);
  assert.equal(isPhoneValid("9876543210"), true);
});

test("the field shows the ten digits, not the country code", () => {
  assert.equal(nationalDigits("+919876543210"), "9876543210");
  assert.equal(nationalDigits(null), "");
  assert.equal(nationalDigits(""), "");
});

test("an older number from another country is shown whole rather than mangled", () => {
  // It cannot be edited in a ten-digit field, so it is handed back intact
  // instead of being silently truncated into a different number.
  assert.equal(nationalDigits("+8801712344192"), "+8801712344192");
});

test("the field keeps ten digits and drops everything else", () => {
  assert.equal(limitNationalInput("98765 43210"), "9876543210");
  assert.equal(limitNationalInput("98765432109999"), "9876543210");
  assert.equal(limitNationalInput("+91 98765"), "9198765".slice(0, 10));
  assert.equal(limitNationalInput("abc"), "");
});

test("the dial code is the one the form shows", () => {
  assert.equal(DEFAULT_DIAL_CODE, "+91");
});
