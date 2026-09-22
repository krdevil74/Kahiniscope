import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_RATES } from "./model.ts";
import {
  amountToShow,
  breakdownOf,
  balanceLabel,
  earningsFor,
  estimateFor,
  isEstimateOnly,
  money,
  moreLabel,
  needsRecordingTime,
  pageOf,
  needsWordCount,
  rateFor,
  rateLabel,
  settleFromBalance,
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
    settledFromAdvance: false,
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

// ---------------------------------------------------------------------------
// Advances
// ---------------------------------------------------------------------------

test("an approval the balance covers is settled outright", () => {
  assert.deepEqual(settleFromBalance(600, 5000), {
    settled: true,
    spent: 600,
    balanceAfter: 4400,
  });
});

test("a balance that exactly covers it is spent to nothing", () => {
  assert.deepEqual(settleFromBalance(600, 600), { settled: true, spent: 600, balanceAfter: 0 });
});

test("all or nothing: a short balance is left alone rather than part-spent", () => {
  // Splitting one approval across an advance and a later transfer would leave
  // a payment record carrying two amounts and two dates.
  assert.deepEqual(settleFromBalance(600, 400), {
    settled: false,
    spent: 0,
    balanceAfter: 400,
  });
});

test("nothing to settle against, or nothing to settle", () => {
  assert.equal(settleFromBalance(600, 0).settled, false);
  assert.equal(settleFromBalance(null, 5000).settled, false, "no figure to spend");
  assert.equal(settleFromBalance(0, 5000).settled, false, "a zero payment spends nothing");
});

test("a nonsense balance is treated as none, not as a licence", () => {
  assert.equal(settleFromBalance(600, Number.NaN).balanceAfter, 0);
  assert.equal(settleFromBalance(600, -500).settled, false);
});

test("the balance line says what the money is", () => {
  assert.equal(balanceLabel(0), "No advance on your account");
  assert.equal(balanceLabel(-10), "No advance on your account");
  assert.match(balanceLabel(4400), /₹4,400 advanced to you/);
});

test("a payment settled from an advance is paid, and says where from", () => {
  const settled = payment({
    status: "paid",
    finalAmount: 600,
    settledFromAdvance: true,
  });
  assert.equal(isEstimateOnly(settled), false);
  assert.equal(amountToShow(settled), 600);
  // And it counts towards what the person has actually been paid.
  assert.equal(earningsFor([settled]).paid, 600);
});

// ---------------------------------------------------------------------------
// Showing a long history a little at a time
// ---------------------------------------------------------------------------

test("a page is the most recent five, and says how many are behind them", () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  const page = pageOf(items);
  assert.deepEqual(page.shown, [1, 2, 3, 4, 5]);
  assert.equal(page.hidden, 2);
  assert.equal(page.hasMore, true);
});

test("a short history is not paged", () => {
  const page = pageOf([1, 2]);
  assert.deepEqual(page.shown, [1, 2]);
  assert.equal(page.hidden, 0);
  assert.equal(page.hasMore, false);
});

test("nothing at all is not a page with a More button", () => {
  const page = pageOf([]);
  assert.deepEqual(page.shown, []);
  assert.equal(page.hasMore, false);
});

test("asking for more than there is does not invent entries", () => {
  const page = pageOf([1, 2, 3], 99);
  assert.deepEqual(page.shown, [1, 2, 3]);
  assert.equal(page.hasMore, false);
});

test("a nonsense size shows nothing rather than everything", () => {
  assert.deepEqual(pageOf([1, 2, 3], -1).shown, []);
});

test("the more button counts, and never says zero", () => {
  assert.equal(moreLabel(1), "Show 1 more");
  assert.equal(moreLabel(12), "Show 12 more");
});

// ---------------------------------------------------------------------------
// Showing the working
// ---------------------------------------------------------------------------

test("a figure from a rate shows the sum that produced it", () => {
  const b = breakdownOf(
    payment({ unit: "voice-narration", rate: 20, quantity: 10, estimatedAmount: 200 })
  );
  assert.equal(b.rate, "₹20 per minute");
  assert.equal(b.quantity, "10 minutes");
  assert.equal(b.working, "₹20 × 10 minutes");
  assert.equal(b.total, "₹200");
  assert.equal(b.note, null);
});

test("one of a thing is not \"1 minutes\"", () => {
  const b = breakdownOf(payment({ unit: "cover", rate: 700, quantity: 1, estimatedAmount: 700 }));
  assert.equal(b.quantity, "1 cover");
  assert.equal(b.working, "₹700 × 1 cover");
});

test("a part minute is not shown to fifteen decimal places", () => {
  const b = breakdownOf(
    payment({ unit: "sound-design", rate: 26, quantity: 12.5, estimatedAmount: 325 })
  );
  assert.equal(b.quantity, "12.5 minutes");
});

test("work with no unit says so rather than leaving a gap", () => {
  const b = breakdownOf(
    payment({ taskType: "Script writing", unit: "manual", estimatedAmount: 1500 })
  );
  assert.equal(b.working, null);
  assert.equal(b.total, "₹1,500");
  assert.match(b.note ?? "", /No unit rate for this kind of work/);
});

test("a final figure that differs from the estimate is explained, not hidden", () => {
  const b = breakdownOf(
    payment({
      status: "paid",
      unit: "voice-character",
      rate: 50,
      quantity: 12,
      estimatedAmount: 600,
      finalAmount: 550,
    })
  );
  assert.equal(b.total, "₹550", "what was actually paid");
  assert.equal(b.working, "₹50 × 12 minutes");
  assert.match(b.note ?? "", /Estimated ₹600; the admin paid ₹550\./);
});

test("a final figure that matches the estimate needs no explanation", () => {
  const b = breakdownOf(
    payment({ status: "paid", unit: "cover", rate: 700, quantity: 1, estimatedAmount: 700, finalAmount: 700 })
  );
  assert.equal(b.note, null);
});
