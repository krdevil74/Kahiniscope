/**
 * The money arithmetic on the server.
 *
 * The same examples as mobile/src/lib/payments.test.ts. The two
 * implementations are separate on purpose — one is bundled into an Android
 * app, the other runs on Node — and the figure the admin approves against is
 * the one calculated here, so they must never disagree.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateFor,
  quantityFor,
  rateFor,
  ratesFrom,
  needsRecordingTime,
  unitsForTaskType,
} from "../lib/payments.js";

test("voice work offers both rates, because nothing in the task says which", () => {
  assert.deepEqual(unitsForTaskType("Voice recording"), ["voice-character", "voice-narration"]);
  assert.deepEqual(unitsForTaskType("Dubbing / mixing"), ["sound-design"]);
  assert.deepEqual(unitsForTaskType("Thumbnail / graphics"), ["cover"]);
});

test("everything else is a figure the admin types", () => {
  for (const type of ["Script writing", "Translation", "Editing", "Upload & SEO", "Music / SFX", "Proofreading"]) {
    assert.deepEqual(unitsForTaskType(type), ["manual"], type);
  }
});

test("one artist, two voice rates", () => {
  const rates = ratesFrom({ voiceCharacter: 50, voiceNarration: 35 });
  assert.equal(rateFor(rates, "voice-character"), 50);
  assert.equal(rateFor(rates, "voice-narration"), 35);
  assert.equal(rateFor(rates, "sound-design"), null);
  assert.equal(rateFor(rates, "manual"), null);
});

test("a rate is a positive number; zero means unpaid, not free", () => {
  const rates = ratesFrom({ voiceCharacter: 0, voiceNarration: -5, cover: "700" });
  assert.equal(rates.voiceCharacter, null);
  assert.equal(rates.voiceNarration, null);
  assert.equal(rates.cover, null, "a string is not a rate");
});

test("junk in the rates field does not become a rate card", () => {
  assert.deepEqual(ratesFrom(null).cover, null);
  assert.deepEqual(ratesFrom("700").cover, null);
});

test("an estimate is minutes times the rate, to the rupee", () => {
  assert.equal(estimateFor(12, 50), 600);
  assert.equal(estimateFor(12.5, 35), 438);
  assert.equal(estimateFor(null, 50), null);
  assert.equal(estimateFor(12, null), null);
  assert.equal(estimateFor(-1, 50), null);
});

test("audio is measured in minutes, a cover is one of itself, a typed figure in nothing", () => {
  assert.equal(quantityFor("voice-character", 12), 12);
  assert.equal(quantityFor("sound-design", 8), 8);
  assert.equal(quantityFor("cover", null), 1);
  assert.equal(quantityFor("manual", 12), null);
  assert.equal(needsRecordingTime("cover"), false);
});
