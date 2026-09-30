import test from "node:test";
import assert from "node:assert/strict";

import { toPayment, taskStatusFrom } from "./payment-convert.ts";

/** What the Firestore SDK actually hands back for each shape. */
const timestamp = (date: Date) => ({ toDate: () => date, seconds: date.getTime() / 1000 });
const reference = (id: string) => ({ id, path: `episodes/${id}`, firestore: {} });

/** Enough of a QueryDocumentSnapshot for a converter. */
function snapshot(id: string, data: Record<string, unknown>) {
  return { id, data: () => data } as unknown as Parameters<typeof toPayment>[0];
}

const BASE = {
  taskId: "t1",
  uid: "u1",
  taskType: "Voice recording",
  status: "paid",
  unit: "voice-character",
  quantity: 2,
  rate: 65,
  estimatedAmount: 130,
  finalAmount: 130,
  approvedAt: timestamp(new Date("2026-09-28T09:00:00Z")),
};

test("the episode is read from a reference as well as an id", () => {
  // Every payment approved before this was fixed carries the task's own
  // DocumentReference, because reviewTask copied the field across whole. The
  // member's screen looks the episode up by id, so each of those rows read
  // "No episode" — the title of the episode they had been paid for.
  const fromReference = toPayment(snapshot("p1", { ...BASE, episodeId: reference("ep61") }));
  assert.equal(fromReference.episodeId, "ep61");

  // What is written from now on.
  const fromString = toPayment(snapshot("p2", { ...BASE, episodeId: "ep61" }));
  assert.equal(fromString.episodeId, "ep61");
});

test("a payment with no episode at all is still an empty string", () => {
  // "" misses the lookup and the row says "No episode", which is the truth
  // here rather than a bug — the point is that it never becomes undefined or
  // an object the lookup would throw on.
  assert.equal(toPayment(snapshot("p3", { ...BASE })).episodeId, "");
  assert.equal(toPayment(snapshot("p4", { ...BASE, episodeId: null })).episodeId, "");
});

test("a legacy task carrying only `done` reads as accepted", () => {
  assert.equal(taskStatusFrom(undefined, true), "approved");
  assert.equal(taskStatusFrom(undefined, false), "open");
  assert.equal(taskStatusFrom("submitted", false), "submitted");
});
