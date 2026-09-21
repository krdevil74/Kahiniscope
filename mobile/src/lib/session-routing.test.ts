import assert from "node:assert/strict";
import test from "node:test";

import { shouldSendToSignIn } from "./session-routing.ts";

const OUT = { loading: false, signedIn: false };
const IN = { loading: false, signedIn: true };
const RESTORING = { loading: true, signedIn: false };

test("signing out of a dashboard sends you back to the door", () => {
  // The bug this exists for: Sign out ended the session and left the person
  // looking at a screen they were no longer entitled to.
  assert.equal(shouldSendToSignIn(OUT, "my-tasks"), true);
  assert.equal(shouldSendToSignIn(OUT, "board"), true);
  assert.equal(shouldSendToSignIn(OUT, "pending"), true);
  assert.equal(shouldSendToSignIn(OUT, "team"), true);
  assert.equal(shouldSendToSignIn(OUT, "episode"), true);
});

test("the door does not send you to itself", () => {
  assert.equal(shouldSendToSignIn(OUT, "sign-in"), false);
});

test("a signed-in person is never sent away", () => {
  for (const segment of ["my-tasks", "board", "pending", "sign-in", undefined]) {
    assert.equal(shouldSendToSignIn(IN, segment), false, String(segment));
  }
});

test("nobody is thrown out while the session is still being restored", () => {
  // A cold start reads `loading: true, signedIn: false` for a moment. Acting
  // on that would sign out everybody on every launch.
  for (const segment of ["my-tasks", "board", undefined]) {
    assert.equal(shouldSendToSignIn(RESTORING, segment), false, String(segment));
  }
});

test("the index route redirects too — the gate there agrees, it does not conflict", () => {
  assert.equal(shouldSendToSignIn(OUT, undefined), true);
});
