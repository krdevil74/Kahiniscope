import assert from "node:assert/strict";
import test from "node:test";

import {
  CLAIM_RETRY_DELAYS_MS,
  claimsAreBehind,
  totalRetryWindowMs,
} from "./claim-refresh.ts";

const APPROVED = { status: "approved", role: "member" };
const PENDING = { status: "pending", role: "member" };

test("a record ahead of the token is what starts a re-check", () => {
  // The admin has approved them; the claim has not caught up yet.
  assert.equal(claimsAreBehind(APPROVED, PENDING), true);
});

test("a promotion counts too, not just an approval", () => {
  assert.equal(
    claimsAreBehind({ status: "approved", role: "admin" }, { status: "approved", role: "member" }),
    true
  );
});

test("agreement is not a reason to ask again", () => {
  assert.equal(claimsAreBehind(APPROVED, APPROVED), false);
  assert.equal(claimsAreBehind(PENDING, PENDING), false);
});

test("no record yet is not a disagreement", () => {
  // A pending account before its first snapshot has nothing to compare.
  assert.equal(claimsAreBehind(null, PENDING), false);
});

test("the first re-check is soon enough that somebody watching sees it", () => {
  assert.ok(CLAIM_RETRY_DELAYS_MS[0] <= 1000, "first retry within a second");
});

test("the delays back off, and never go backwards", () => {
  for (let i = 1; i < CLAIM_RETRY_DELAYS_MS.length; i++) {
    assert.ok(
      CLAIM_RETRY_DELAYS_MS[i] > CLAIM_RETRY_DELAYS_MS[i - 1],
      `delay ${i} should be longer than ${i - 1}`
    );
  }
});

test("it tries for long enough to cover a slow trigger, and then stops", () => {
  const total = totalRetryWindowMs();
  assert.ok(total >= 20_000, "a cold Cloud Function can take a while");
  assert.ok(total <= 60_000, "past this, waiting is not the answer");
  assert.equal(totalRetryWindowMs([]), 0, "an empty schedule is not an infinite one");
});
