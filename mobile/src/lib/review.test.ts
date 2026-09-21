import assert from "node:assert/strict";
import test from "node:test";

import { gapFor } from "./escalation.ts";
import type { Task } from "./model.ts";
import {
  byReviewOrder,
  chaseGapFor,
  doneFor,
  isAccepted,
  isAwaitingReview,
  isChased,
  isRejected,
  REJECTED_GAP_DAYS,
  rejectionLabel,
  statusLabel,
  submitLabel,
  submittedTasks,
} from "./review.ts";

function task(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    episodeId: "ep41",
    assigneeUid: "u1",
    type: "Voice recording",
    dueDate: null,
    status: "open",
    done: false,
    doneAt: null,
    submittedAt: null,
    submissionNote: null,
    rejectedAt: null,
    rejectionNote: null,
    rejectedCount: 0,
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: null,
    preferredChannel: null,
    ...overrides,
  };
}

const PLAN = [7, 4, 3, 2, 1];

test("a task that came back is open again, not a state of its own", () => {
  const sent = task({ status: "open", rejectedAt: new Date() });
  assert.equal(isRejected(sent), true);
  assert.equal(isChased(sent), true, "it is work somebody still owes");
});

test("submitted work is not rejected work, whatever it carries", () => {
  // rejectedAt survives a resubmission as history; it must not still read as
  // rejected once the work is back in.
  const resubmitted = task({ status: "submitted", rejectedAt: new Date(), rejectedCount: 1 });
  assert.equal(isRejected(resubmitted), false);
  assert.equal(isAwaitingReview(resubmitted), true);
});

test("nobody is chased while an admin has the work", () => {
  assert.equal(isChased(task({ status: "submitted" })), false);
  assert.equal(isChased(task({ status: "approved" })), false);
  assert.equal(isChased(task({ status: "paid" })), false);
  assert.equal(isChased(task({ status: "open" })), true);
});

test("a rejected task is chased every other day, not up the ladder", () => {
  const sent = task({ status: "open", rejectedAt: new Date(), remindersSent: 0 });
  assert.equal(chaseGapFor(sent, PLAN, gapFor), REJECTED_GAP_DAYS);
  // And it stays two days however many reminders have gone out — the ladder
  // would have narrowed to one day by now.
  assert.equal(chaseGapFor({ ...sent, remindersSent: 9 }, PLAN, gapFor), REJECTED_GAP_DAYS);
});

test("an ordinary open task still climbs the ladder", () => {
  assert.equal(chaseGapFor(task({ remindersSent: 0 }), PLAN, gapFor), 7);
  assert.equal(chaseGapFor(task({ remindersSent: 3 }), PLAN, gapFor), 2);
});

test("accepted means approved or paid, and that is what `done` ever meant", () => {
  assert.equal(isAccepted(task({ status: "approved" })), true);
  assert.equal(isAccepted(task({ status: "paid" })), true);
  assert.equal(isAccepted(task({ status: "submitted" })), false);
  assert.equal(doneFor("approved"), true);
  assert.equal(doneFor("paid"), true);
  assert.equal(doneFor("submitted"), false);
  assert.equal(doneFor("open"), false);
});

test("the review queue puts the longest wait first", () => {
  const monday = task({ id: "a", status: "submitted", submittedAt: new Date("2026-09-14T09:00:00Z") });
  const friday = task({ id: "b", status: "submitted", submittedAt: new Date("2026-09-18T09:00:00Z") });
  const open = task({ id: "c" });
  assert.deepEqual(byReviewOrder([friday, open, monday]).map((t) => t.id), ["a", "b"]);
  assert.equal(submittedTasks([friday, open, monday]).length, 2);
});

test("the member's button says what is actually possible", () => {
  assert.equal(submitLabel(task({})), "Submit for review");
  assert.equal(submitLabel(task({ status: "open", rejectedAt: new Date() })), "Submit again");
  assert.equal(submitLabel(task({ status: "submitted" })), "Waiting for review");
  assert.equal(submitLabel(task({ status: "paid" })), "Approved");
});

test("a rejection carries the reason, because a bare refusal is not feedback", () => {
  assert.equal(
    rejectionLabel({ rejectedCount: 1, rejectionNote: "Levels are too hot from 4:10." }),
    "Sent back: Levels are too hot from 4:10."
  );
  assert.equal(rejectionLabel({ rejectedCount: 1, rejectionNote: null }), "Sent back for changes");
  assert.match(rejectionLabel({ rejectedCount: 3, rejectionNote: "Again." }), /sent back 3 times/);
});

test("status reads plainly on both sides", () => {
  assert.equal(statusLabel(task({ status: "submitted" })), "In review");
  assert.equal(statusLabel(task({ status: "approved" })), "Approved · payment pending");
  assert.equal(statusLabel(task({ status: "paid" })), "Paid");
  assert.equal(statusLabel(task({ status: "open", rejectedAt: new Date() })), "Sent back");
  assert.equal(statusLabel(task({ status: "open" })), "Open");
});
