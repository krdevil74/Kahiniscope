import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceBody,
  advanceShort,
  approvedBody,
  digestBody,
  digestShort,
  overduePhrase,
  paidBody,
  paidShort,
  rejectedBody,
  reminderBody,
  reminderShort,
  taskSentence,
  welcomeBody,
} from "../lib/messaging/copy.js";

const TASK = {
  taskType: "Voice recording",
  episodeCode: "EP-41",
  episodeTitle: "রক্তমুখী নীলা",
  daysOverdue: 4,
};

test("the sentence follows the pattern the handoff sets", () => {
  assert.equal(
    taskSentence(TASK),
    "Voice recording for EP-41 রক্তমুখী নীলা is 4 days overdue."
  );
});

test("one day is singular, today is today, and early is early", () => {
  assert.equal(overduePhrase(1), "1 day overdue");
  assert.equal(overduePhrase(4), "4 days overdue");
  assert.equal(overduePhrase(0), "due today");
  assert.equal(overduePhrase(-1), "due in 1 day");
  assert.equal(overduePhrase(-3), "due in 3 days");
});

test("the body opens with a first name and closes with the action", () => {
  const body = reminderBody("Rizu Ahmed", TASK);
  assert.match(body, /^Rizu, /);
  assert.match(body, /Tap Mark done when it is finished\.$/);
  assert.match(body, /রক্তমুখী নীলা/, "the Bengali title survives");
});

test("a message with no name still reads properly", () => {
  assert.match(reminderBody("", TASK), /^Voice recording for EP-41/);
});

test("the short form fits a notification title", () => {
  assert.equal(reminderShort(TASK), "Voice recording · EP-41 · 4 days overdue");
  assert.ok(reminderShort(TASK).length < 65);
});

test("Nudge all sends one message listing everything", () => {
  const second = { ...TASK, taskType: "Editing", episodeCode: "EP-42", daysOverdue: 0 };
  const body = digestBody("Rizu Ahmed", [TASK, second]);

  assert.match(body, /^Rizu, you have 2 open tasks:/);
  assert.match(body, /• Voice recording — EP-41 রক্তমুখী নীলা \(4 days overdue\)/);
  assert.match(body, /• Editing — EP-42 রক্তমুখী নীলা \(due today\)/);
});

test("a digest of one is just the reminder", () => {
  assert.equal(digestBody("Rizu Ahmed", [TASK]), reminderBody("Rizu Ahmed", TASK));
  assert.equal(digestShort([TASK]), reminderShort(TASK));
});

test("an empty digest says so rather than sending a list of nothing", () => {
  assert.match(digestBody("Rizu Ahmed", []), /nothing is open for you/);
});

test("the digest headline counts what is actually late", () => {
  const onTime = { ...TASK, daysOverdue: -2 };
  assert.equal(digestShort([TASK, onTime]), "2 open tasks · 1 overdue");
});

test("the welcome names the craft it was approved as", () => {
  assert.match(welcomeBody("Shuvo Karim", ["Editing"]), /^Shuvo, you are approved as Editing/);
  assert.match(welcomeBody("Shuvo Karim", null), /^Shuvo, you are approved on Kahiniscope/);
  assert.match(welcomeBody("Shuvo Karim", []), /^Shuvo, you are approved on Kahiniscope/);
  // One person is rarely one thing, and the welcome should say what they
  // were actually approved for.
  assert.match(
    welcomeBody("Rizu Ahmed", ["Voice", "Editing"]),
    /^Rizu, you are approved as Voice · Editing/
  );
});

// --- what an admin just did to somebody's work -----------------------------

test("an approval settled from an advance reads as payment, not as a promise", () => {
  const body = approvedBody("Rizu Ahmed", "Voice recording", {
    settledFromAdvance: true,
    amount: 600,
    balanceAfter: 4400,
  });
  assert.match(body, /^Rizu, your Voice recording has been approved\./);
  assert.match(body, /₹600 has been taken off the advance/);
  assert.match(body, /leaving ₹4,400/);
});

test("an approval that is not settled says plainly that the figure can move", () => {
  const body = approvedBody("Rizu Ahmed", "Voice recording", {
    settledFromAdvance: false,
    amount: 600,
    balanceAfter: 0,
  });
  assert.match(body, /₹600 is now pending/);
  assert.match(body, /can differ depending on what the work needed/);
});

test("an approval with no figure behind it promises nothing", () => {
  const body = approvedBody("Rizu", "Editing", {
    settledFromAdvance: false,
    amount: null,
    balanceAfter: 0,
  });
  assert.match(body, /settled by the admin/);
  assert.doesNotMatch(body, /₹/);
});

test("a rejection carries the reason, because that is the whole message", () => {
  const body = rejectedBody("Rizu Ahmed", "Voice recording", "Levels are too hot from 4:10.");
  assert.match(body, /come back for changes: Levels are too hot from 4:10\./);
  assert.match(body, /Submit it again/);
});

test("being paid, and being advanced, say which is which", () => {
  assert.equal(paidShort(1250), "₹1,250 paid");
  assert.match(paidBody("Rizu Ahmed", "Voice recording", 550), /₹550 has been paid to you/);

  assert.equal(advanceShort(5000), "₹5,000 advanced");
  const body = advanceBody("Rizu Ahmed", 5000, 5000, "Before EP-61");
  assert.match(body, /₹5,000 has been advanced to you \(Before EP-61\)/);
  assert.match(body, /balance is ₹5,000, and approved work is taken off it/);
});
