/**
 * The Telegram button hands work in; it never accepts it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { tapAnswer, tapOutcome, TELEGRAM_SUBMISSION_NOTE } from "../lib/telegram-submit.js";
import { doneCallbackData, parseCallbackData } from "../lib/messaging/telegram.js";

test("an open task is submitted, never closed", () => {
  assert.equal(tapOutcome({ status: "open" }), "submit");
  // Older tasks carry no status at all; open is what that means.
  assert.equal(tapOutcome({}), "submit");
  assert.equal(tapOutcome({ done: false }), "submit");
});

test("a task sent back is submitted again", () => {
  // A rejection puts the task back to open, with the note beside it.
  assert.equal(tapOutcome({ status: "open", rejectedAt: new Date() }), "submit");
});

test("work already handed in is left alone", () => {
  assert.equal(tapOutcome({ status: "submitted" }), "already-submitted");
});

test("accepted work is left alone, including the old Telegram-closed shape", () => {
  assert.equal(tapOutcome({ status: "approved" }), "already-accepted");
  assert.equal(tapOutcome({ status: "paid" }), "already-accepted");
  assert.equal(tapOutcome({ done: true }), "already-accepted");
});

test("every outcome says something, and submitting says the reminders stop", () => {
  assert.match(tapAnswer("submit"), /Submitted for review/);
  assert.match(tapAnswer("submit"), /Reminders stopped/);
  assert.ok(tapAnswer("already-submitted"));
  assert.ok(tapAnswer("already-accepted"));
  assert.ok(TELEGRAM_SUBMISSION_NOTE.length <= 500);
});

test("buttons already in people's chats still parse", () => {
  assert.deepEqual(parseCallbackData(doneCallbackData("task-1")), { action: "done", taskId: "task-1" });
  assert.deepEqual(parseCallbackData("done:abc"), { action: "done", taskId: "abc" });
  assert.equal(parseCallbackData("nonsense"), null);
});
