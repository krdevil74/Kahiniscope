import assert from "node:assert/strict";
import test from "node:test";

import {
  fitsProofLimit,
  hasProof,
  isProofAvailable,
  MAX_PROOF_BASE64,
  proofDataUri,
  proofDaysLeft,
  proofFileName,
  proofLabel,
  PROOF_TTL_DAYS,
} from "./payment-proof.ts";

const NOW = new Date("2026-09-30T09:00:00Z");

/** A payment with a screenshot attached `days` ago. */
function attached(daysAgo: number) {
  const at = new Date(NOW.getTime() - daysAgo * 86_400_000);
  return {
    proofAttachedAt: at,
    proofExpiresAt: new Date(at.getTime() + PROOF_TTL_DAYS * 86_400_000),
  };
}

test("a payment with no screenshot has never had one", () => {
  const none = { proofAttachedAt: null, proofExpiresAt: null };
  assert.equal(hasProof(none), false);
  assert.equal(isProofAvailable(none, NOW), false);
  assert.equal(proofLabel(none, NOW), null, "nothing to say, so nothing is drawn");
});

test("a screenshot attached today is available for a month", () => {
  const p = attached(0);
  assert.equal(hasProof(p), true);
  assert.equal(isProofAvailable(p, NOW), true);
  assert.equal(proofDaysLeft(p, NOW), PROOF_TTL_DAYS);
  assert.equal(proofLabel(p, NOW), "Screenshot · 30 days left");
});

test("the last hours say so rather than counting zero days", () => {
  // Half a day left floors to nothing, and "0 days left" reads as expired to
  // somebody deciding whether to save the file now.
  const p = { proofAttachedAt: NOW, proofExpiresAt: new Date(NOW.getTime() + 43_200_000) };
  assert.equal(isProofAvailable(p, NOW), true);
  assert.equal(proofDaysLeft(p, NOW), 0);
  assert.equal(proofLabel(p, NOW), "Screenshot · last day");
});

test("one day left is singular", () => {
  assert.equal(proofLabel(attached(PROOF_TTL_DAYS - 1), NOW), "Screenshot · 1 day left");
});

test("an expired screenshot says it has gone, not nothing", () => {
  // This is the whole reason a payment keeps `proofAttachedAt` as well as the
  // expiry: somebody who saw the image last month should read that it was
  // deleted, not find a row that never mentioned one.
  const p = attached(PROOF_TTL_DAYS + 3);
  assert.equal(hasProof(p), true);
  assert.equal(isProofAvailable(p, NOW), false);
  assert.equal(proofDaysLeft(p, NOW), 0, "never negative");
  assert.equal(proofLabel(p, NOW), "Screenshot expired");
});

test("expiry is judged by the date, not by the sweep having run", () => {
  // The sweep runs once a day, so a proof can be minutes past its date and
  // still sitting in Firestore. Treating it as gone the moment it expires is
  // what keeps the app and the job from disagreeing where anybody can see.
  const justOver = { proofAttachedAt: NOW, proofExpiresAt: new Date(NOW.getTime() - 1000) };
  assert.equal(isProofAvailable(justOver, NOW), false);
});

test("the payload limit is the one the server enforces", () => {
  assert.equal(fitsProofLimit("a".repeat(MAX_PROOF_BASE64)), true);
  assert.equal(fitsProofLimit("a".repeat(MAX_PROOF_BASE64 + 1)), false);
  assert.equal(fitsProofLimit(""), false);
});

test("the file is named after the payment, because it leaves the app", () => {
  const p = { id: "aBc123XYZ789", taskType: "Voice recording" };
  assert.equal(proofFileName(p), "payment-voice-recording-aBc123.jpg");
  assert.equal(proofFileName(p, "image/png"), "payment-voice-recording-aBc123.png");
  // A type somebody typed into the Assign form's box, punctuation and all.
  assert.equal(
    proofFileName({ id: "p1", taskType: "Dubbing / mixing" }, "image/webp"),
    "payment-dubbing-mixing-p1.webp"
  );
});

test("a data URI is what an Image source needs", () => {
  assert.equal(
    proofDataUri({ data: "AAAA", contentType: "image/jpeg" }),
    "data:image/jpeg;base64,AAAA"
  );
});
