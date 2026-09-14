import test from "node:test";
import assert from "node:assert/strict";

import { isConfigured, readSecret } from "../lib/messaging/configured.js";

test("a real value is configured", () => {
  assert.equal(isConfigured("123456:AAF3qRealLookingToken"), true);
  assert.equal(isConfigured("EAAG..."), true);
});

test("the placeholders a fresh project has to put in Secret Manager are not", () => {
  // Every declared secret must exist before a function can deploy, so a
  // project with no WhatsApp account still needs a WHATSAPP_TOKEN. These are
  // what goes in it, and none of them is a credential.
  for (const value of ["", "unset", "UNSET", " unset ", "none", "changeme", "todo"]) {
    assert.equal(isConfigured(value), false, JSON.stringify(value));
  }
  assert.equal(isConfigured(undefined), false);
  assert.equal(isConfigured(null), false);
});

test("readSecret falls back to the environment, then to empty", () => {
  const bound = { value: () => "from-secret-manager" };
  assert.equal(readSecret(bound, "NOT_SET_ANYWHERE"), "from-secret-manager");

  const unbound = { value: () => { throw new Error("not bound"); } };
  process.env.TEST_FALLBACK = "from-env";
  assert.equal(readSecret(unbound, "TEST_FALLBACK"), "from-env");
  delete process.env.TEST_FALLBACK;

  assert.equal(readSecret(unbound, "STILL_NOT_SET"), "");
});

test("a placeholder in Secret Manager reads as empty, not as a credential", () => {
  const placeholder = { value: () => "unset" };
  assert.equal(readSecret(placeholder, "NOPE"), "");
});
