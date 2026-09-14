import test from "node:test";
import assert from "node:assert/strict";

import {
  digestBody,
  digestShort,
  overduePhrase,
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
  assert.match(welcomeBody("Shuvo Karim", "Editing"), /^Shuvo, you are approved as Editing/);
  assert.match(welcomeBody("Shuvo Karim", null), /^Shuvo, you are approved on Kahiniscope/);
});
