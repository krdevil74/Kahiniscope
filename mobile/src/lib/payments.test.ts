import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_RATES } from "./model.ts";
import {
  amountToShow,
  earningsFor,
  estimateFor,
  isEstimateOnly,
  money,
  needsRecordingTime,
  needsWordCount,
  rateFor,
  rateLabel,
  unitsForTaskType,
  type Payment,
} from "./payments.ts";

function payment(overrides: Partial<Payment>): Payment {
  return {
    id: "p1",
    taskId: "t1",
    uid: "u1",
    episodeId: "ep41",
    taskType: "Voice recording",
    status: "pending",
    unit: "voice-narration",
    quantity: null,
    rate: null,
    estimatedAmount: null,
    finalAmount: null,
    recordingMinutes: null,
    wordCount: null,
    comment: null,
    approvedAt: null,
    paidAt: null,
    ...overrides,
  };
}

test("voice work offers both rates, because nothing in the task says which", () => {
  assert.deepEqual(unitsForTaskType("Voice recording"), ["voice-character", "voice-narration"]);
});

test("the mix and the cover each have one unit", () => {
  assert.deepEqual(unitsForTaskType("Dubbing / mixing"), ["sound-design"]);
  assert.deepEqual(unitsForTaskType("Thumbnail / graphics"), ["cover"]);
});

test("everything else is a figure the admin types", () => {
  for (const type of ["Script writing", "Translation", "Editing", "Upload & SEO", "Music / SFX", "Proofreading"]) {
    assert.deepEqual(unitsForTaskType(type), ["manual"], type);
  }
});

test("minutes are asked for only where they are the unit", () => {
  assert.equal(needsRecordingTime("voice-character"), true);
  assert.equal(needsRecordingTime("sound-design"), true);
  assert.equal(needsRecordingTime("cover"), false);
  assert.equal(needsRecordingTime("manual"), false);
});

test("a word count is context on a script, and asked for nowhere else", () => {
  assert.equal(needsWordCount("Script writing"), true);
  assert.equal(needsWordCount("Voice recording"), false);
});

test("one artist, two voice rates", () => {
  const rates = { ...EMPTY_RATES, voiceCharacter: 50, voiceNarration: 35 };
  assert.equal(rateFor(rates, "voice-character"), 50);
  assert.equal(rateFor(rates, "voice-narration"), 35);
  assert.equal(rateFor(rates, "sound-design"), null);
  // A typed amount never comes off a rate card.
  assert.equal(rateFor({ ...rates, cover: 700 }, "manual"), null);
});

test("an estimate is minutes times the rate, to the rupee", () => {
  assert.equal(estimateFor(12, 50), 600);
  assert.equal(estimateFor(12.5, 35), 438);
});

test("there is no estimate without both halves", () => {
  assert.equal(estimateFor(null, 50), null);
  assert.equal(estimateFor(12, null), null);
});

test("nonsense does not become an amount", () => {
  assert.equal(estimateFor(-1, 50), null);
  assert.equal(estimateFor(12, -50), null);
  assert.equal(estimateFor(Number.NaN, 50), null);
  assert.equal(estimateFor(Number.POSITIVE_INFINITY, 50), null);
});

test("a figure is only real once it has been paid", () => {
  assert.equal(isEstimateOnly(payment({ status: "pending", estimatedAmount: 600 })), true);
  assert.equal(isEstimateOnly(payment({ status: "paid", finalAmount: 550 })), false);
  // Marked paid with no figure is not a figure anybody should trust.
  assert.equal(isEstimateOnly(payment({ status: "paid", finalAmount: null })), true);
});

test("what is shown is the real figure when there is one", () => {
  assert.equal(amountToShow(payment({ estimatedAmount: 600, finalAmount: 550 })), 550);
  assert.equal(amountToShow(payment({ estimatedAmount: 600 })), 600);
  assert.equal(amountToShow(payment({})), null);
  // Zero is a decision, not an absence.
  assert.equal(amountToShow(payment({ estimatedAmount: 600, finalAmount: 0 })), 0);
});

test("paid and pending are counted apart, and never added together", () => {
  const summary = earningsFor([
    payment({ status: "paid", finalAmount: 550, estimatedAmount: 600 }),
    payment({ status: "paid", finalAmount: 700 }),
    payment({ status: "pending", estimatedAmount: 600 }),
    payment({ status: "pending", estimatedAmount: 300 }),
  ]);
  assert.equal(summary.paid, 1250, "only figures an admin actually agreed to");
  assert.equal(summary.pendingEstimate, 900);
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.pendingIncomplete, false);
});

test("a pending entry with no rate makes the pending total partial, and says so", () => {
  const summary = earningsFor([
    payment({ status: "pending", estimatedAmount: 600 }),
    payment({ status: "pending", unit: "manual", estimatedAmount: null }),
  ]);
  assert.equal(summary.pendingEstimate, 600);
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.pendingIncomplete, true);
});

test("nobody has earned anything yet", () => {
  assert.deepEqual(earningsFor([]), {
    paid: 0,
    pendingEstimate: 0,
    pendingCount: 0,
    pendingIncomplete: false,
  });
});

test("money reads the way it is written in India", () => {
  assert.equal(money(1250), "₹1,250");
  assert.equal(money(0), "₹0");
  assert.equal(money(null), "—");
});

test("a rate reads as a sentence", () => {
  assert.equal(rateLabel(50, "voice-character"), "₹50 per minute");
  assert.equal(rateLabel(700, "cover"), "₹700 per cover");
  assert.equal(rateLabel(null, "cover"), "no rate set");
});
