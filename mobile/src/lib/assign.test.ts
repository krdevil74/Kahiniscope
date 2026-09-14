import test from "node:test";
import assert from "node:assert/strict";

import {
  assignedToast,
  dueDateFrom,
  INITIAL_DRAFT,
  isComplete,
  isEpisodeValid,
  ladderBars,
  ladderNote,
  missingFrom,
  nextEpisodeCode,
  stepDueDays,
  submitLabel,
} from "./assign.ts";

const PLAN = [7, 4, 3, 2, 1];

test("the stepper stops at one day", () => {
  assert.equal(stepDueDays(5, -1), 4);
  assert.equal(stepDueDays(1, -1), 1);
  assert.equal(stepDueDays(1, -5), 1);
  assert.equal(stepDueDays(5, 1), 6);
});

test("a draft is incomplete until all three choices are made", () => {
  assert.equal(isComplete(INITIAL_DRAFT), false);
  assert.equal(missingFrom(INITIAL_DRAFT), "Pick a person");

  const withPerson = { ...INITIAL_DRAFT, assigneeUid: "u1" };
  assert.equal(missingFrom(withPerson), "Pick an episode");

  const withEpisode = { ...withPerson, episodeId: "e1" };
  assert.equal(missingFrom(withEpisode), "Pick a task");

  const complete = { ...withEpisode, type: "Voice recording" };
  assert.equal(isComplete(complete), true);
  assert.equal(missingFrom(complete), null);
});

test("the channel is optional — the chain falls through anyway", () => {
  const draft = { ...INITIAL_DRAFT, assigneeUid: "u1", episodeId: "e1", type: "Editing", channel: null };
  assert.equal(isComplete(draft), true);
});

test("due dates are counted forward in whole days", () => {
  const now = new Date(2026, 8, 14, 9, 0);
  assert.equal(dueDateFrom(now, 5).getDate(), 19);
  assert.equal(dueDateFrom(now, 20).getMonth(), 9, "crosses into October");
  // Never today, however the stepper is abused.
  assert.equal(dueDateFrom(now, 0).getDate(), 15);
  assert.equal(dueDateFrom(now, -3).getDate(), 15);
});

test("the ladder preview rises left to right", () => {
  const bars = ladderBars(PLAN);
  assert.deepEqual(bars.map((b) => b.days), [7, 4, 3, 2, 1]);
  assert.deepEqual(bars.map((b) => b.height), [22, 30, 38, 46, 54]);
  assert.deepEqual(bars.map((b) => b.step), [0, 1, 2, 3, 4]);
});

test("the ladder note restates whatever the settings say", () => {
  assert.equal(
    ladderNote(PLAN),
    "First nudge 7 days after assigning, then 4, 3, 2, 1 day gaps, then daily until done."
  );
  assert.equal(
    ladderNote([5, 2]),
    "First nudge 5 days after assigning, then 2 day gaps, then every 2 days until done."
  );
  assert.equal(ladderNote([3]), "A nudge every 3 days until the task is done.");
  assert.match(ladderNote([]), /will not go out/);
});

test("the submit button names the person", () => {
  assert.equal(submitLabel("Rizu"), "Assign to Rizu & notify");
  assert.equal(submitLabel(""), "Assign & notify");
});

test("the toast promises the first reminder from live settings", () => {
  assert.equal(
    assignedToast("Voice recording", "Rizu Ahmed", PLAN),
    "Voice recording assigned to Rizu Ahmed · first reminder in 7 days"
  );
  assert.match(assignedToast("Editing", "Tanmoy", [1, 1]), /in 1 day$/);
});

test("the next episode code continues the run", () => {
  assert.equal(nextEpisodeCode([{ code: "EP-41" }, { code: "EP-42" }, { code: "EP-43" }]), "EP-44");
  assert.equal(nextEpisodeCode([{ code: "EP-09" }]), "EP-10");
  assert.equal(nextEpisodeCode([]), "EP-01");
  // Out of order, and with something that is not a code at all.
  assert.equal(nextEpisodeCode([{ code: "EP-43" }, { code: "pilot" }, { code: "EP-41" }]), "EP-44");
});

test("an episode needs a code and a title", () => {
  assert.equal(isEpisodeValid({ code: "EP-44", title: "নতুন গল্প", airInDays: 7 }), true);
  assert.equal(isEpisodeValid({ code: "  ", title: "নতুন গল্প", airInDays: 7 }), false);
  assert.equal(isEpisodeValid({ code: "EP-44", title: "   ", airInDays: 7 }), false);
});
