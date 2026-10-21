import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_PASSWORD,
  credentialsProblem,
  isEmailShaped,
  normaliseEmail,
  passwordErrorMessage,
} from "./password-rules.ts";

test("an address is trimmed and lower-cased before it is sent", () => {
  assert.equal(normaliseEmail("  Rizu.Ahmed@Gmail.COM "), "rizu.ahmed@gmail.com");
});

test("only something address-shaped is accepted", () => {
  assert.equal(isEmailShaped("rizu@gmail.com"), true);
  assert.equal(isEmailShaped(" rizu@gmail.com "), true);
  for (const bad of ["", "rizu", "rizu@", "@gmail.com", "rizu@gmail", "ri zu@gmail.com"]) {
    assert.equal(isEmailShaped(bad), false, bad);
  }
});

test("the form says what is missing, in order", () => {
  assert.equal(credentialsProblem("", "", "signIn"), "Enter your email address.");
  assert.equal(credentialsProblem("rizu@gmail.com", "", "signIn"), "Enter your password.");
  assert.equal(credentialsProblem("rizu@gmail.com", "x", "signIn"), null);
});

test("length is only enforced on a new password", () => {
  const short = "a".repeat(MIN_PASSWORD - 1);
  assert.match(credentialsProblem("rizu@gmail.com", short, "create") ?? "", /at least 8/);
  assert.equal(credentialsProblem("rizu@gmail.com", "a".repeat(MIN_PASSWORD), "create"), null);
  // An existing password is whatever it is.
  assert.equal(credentialsProblem("rizu@gmail.com", short, "signIn"), null);
});

test("a wrong password and an unknown address read the same", () => {
  const wrong = passwordErrorMessage("auth/wrong-password", "signIn");
  assert.equal(passwordErrorMessage("auth/user-not-found", "signIn"), wrong);
  assert.equal(passwordErrorMessage("auth/invalid-credential", "signIn"), wrong);
});

test("an address already taken points at the way back in", () => {
  assert.match(passwordErrorMessage("auth/email-already-in-use", "create"), /Sign in instead/);
});

test("an unknown code still says something true", () => {
  assert.equal(passwordErrorMessage(undefined, "signIn"), "Sign-in failed. Try again.");
  assert.equal(passwordErrorMessage("auth/odd", "create"), "Could not create the account. Try again.");
});
