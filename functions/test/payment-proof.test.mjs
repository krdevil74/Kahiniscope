/**
 * The rules a payment screenshot is written and deleted by, on the server.
 *
 * Pure only: the callable and the sweep are exercised against the emulators in
 * tests/payments.test.mjs, where a Firestore document can actually be written
 * and a clock can be moved past an expiry.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  base64Bytes,
  expiryFrom,
  isBase64,
  MAX_PROOF_BASE64,
  PROOF_CONTENT_TYPES,
  PROOF_TTL_DAYS,
} from "../lib/payment-proof.js";

test("a screenshot expires thirty days after it is attached", () => {
  const now = new Date("2026-09-30T09:00:00Z");
  assert.equal(expiryFrom(now).toISOString(), "2026-10-30T09:00:00.000Z");
  assert.equal(PROOF_TTL_DAYS, 30);
});

test("a nonsense retention never means no retention", () => {
  // The expiry is what the sweep reads. A zero or a NaN here would write a
  // document that is already expired, or one that never is.
  const now = new Date("2026-09-30T09:00:00Z");
  assert.equal(expiryFrom(now, 0).toISOString(), "2026-10-30T09:00:00.000Z");
  assert.equal(expiryFrom(now, Number.NaN).toISOString(), "2026-10-30T09:00:00.000Z");
  assert.equal(expiryFrom(now, 1).toISOString(), "2026-10-01T09:00:00.000Z");
});

test("base64 is checked, because the string ends up in a data URI", () => {
  assert.equal(isBase64("AAAA"), true);
  assert.equal(isBase64("AA=="), true);
  assert.equal(isBase64("AAA="), true);
  // A data: prefix, a newline, or anything the app should have stripped.
  assert.equal(isBase64("data:image/png;base64,AAAA"), false);
  assert.equal(isBase64("AA AA"), false);
  assert.equal(isBase64("AAA"), false, "length has to be a multiple of four");
  assert.equal(isBase64(""), false);
});

test("the size limit leaves room under Firestore's document cap", () => {
  // A document cannot exceed 1 MiB including field names and overhead, and the
  // limit is on the base64 rather than the image, because the base64 is what is
  // stored.
  assert.ok(MAX_PROOF_BASE64 < 1_048_576);
  assert.equal(base64Bytes("a".repeat(MAX_PROOF_BASE64)) < MAX_PROOF_BASE64, true);
});

test("the decoded size is what is worth logging", () => {
  assert.equal(base64Bytes("AAAA"), 3);
  assert.equal(base64Bytes("AAA="), 2);
  assert.equal(base64Bytes("AA=="), 1);
  assert.equal(base64Bytes(""), 0);
});

test("only the three image types the app can render", () => {
  assert.deepEqual([...PROOF_CONTENT_TYPES], ["image/jpeg", "image/png", "image/webp"]);
});
