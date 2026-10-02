import assert from "node:assert/strict";
import test from "node:test";

import type { Task } from "./model.ts";
import {
  deleteEpisodeLabel,
  episodeDeletable,
  episodeDeletedToast,
  isAccepted,
  taskDeletable,
  taskDeletedToast,
} from "./removal.ts";

function task(overrides: Partial<Task>): Pick<Task, "status" | "done"> {
  return { status: "open", done: false, ...overrides } as Pick<Task, "status" | "done">;
}

test("a task nobody has accepted can go", () => {
  assert.equal(taskDeletable(task({})).ok, true);
  // Handed in but not yet looked at: no payment exists, so nothing is orphaned.
  assert.equal(taskDeletable(task({ status: "submitted" })).ok, true);
  // Sent back is `open` with a rejection on it, and is still deletable.
  assert.equal(taskDeletable(task({ status: "open" })).ok, true);
});

test("accepted work cannot, because a payment names it", () => {
  for (const status of ["approved", "paid"] as const) {
    const verdict = taskDeletable(task({ status }));
    assert.equal(verdict.ok, false, status);
    assert.match(verdict.reason ?? "", /payment/i);
  }
});

test("a task closed by an older build counts as accepted too", () => {
  // `done` and nothing else is what a pre-review-flow task carries, and it
  // meant exactly what `approved` means now.
  assert.equal(isAccepted(task({ status: "open", done: true })), true);
  assert.equal(taskDeletable(task({ status: "open", done: true })).ok, false);
});

test("an episode goes only if nothing on it has been accepted", () => {
  assert.equal(episodeDeletable([]).ok, true, "an empty slate is the mistyped one");
  assert.equal(episodeDeletable([task({}), task({ status: "submitted" })]).ok, true);
});

test("an episode with approved work says how much, because it changes the decision", () => {
  const one = episodeDeletable([task({}), task({ status: "approved" })]);
  assert.equal(one.ok, false);
  assert.match(one.reason ?? "", /1 task has been approved/);
  assert.match(one.reason ?? "", /broadcast/, "and says what to do instead");

  const several = episodeDeletable([task({ status: "paid" }), task({ status: "approved" })]);
  assert.match(several.reason ?? "", /2 tasks have been approved/);
});

test("the button names what goes with the episode", () => {
  // Deleting EP-61 deletes the nine tasks on it, and a button that says only
  // "Delete episode" has not said so.
  assert.equal(deleteEpisodeLabel(9, false), "Delete this episode");
  assert.equal(deleteEpisodeLabel(9, true), "Delete it and 9 tasks — tap again");
  assert.equal(deleteEpisodeLabel(1, true), "Delete it and 1 task — tap again");
  assert.equal(deleteEpisodeLabel(0, true), "Delete it — tap again");
});

test("what the toast says afterwards", () => {
  assert.equal(taskDeletedToast("Voice recording"), "Voice recording deleted");
  assert.equal(episodeDeletedToast("EP-61", 0), "EP-61 deleted");
  assert.equal(episodeDeletedToast("EP-61", 1), "EP-61 deleted, with 1 task");
  assert.equal(episodeDeletedToast("EP-61", 9), "EP-61 deleted, with 9 tasks");
});
