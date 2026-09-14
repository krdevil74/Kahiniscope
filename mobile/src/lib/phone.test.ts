import test from "node:test";
import assert from "node:assert/strict";

import { isPhoneValid, normalisePhone } from "./phone.ts";

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
    assert.equal(isPhoneValid(junk), false);
  }
});

test("a half-typed number is not treated as valid", () => {
  assert.equal(isPhoneValid("+8801"), false);
  assert.equal(isPhoneValid("0171"), false);
  assert.equal(isPhoneValid("+8801712344192"), true);
});
