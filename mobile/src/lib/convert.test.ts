import test from "node:test";
import assert from "node:assert/strict";

import { toBool, toDate, toId, toNumber, toStringArray, toStringOrNull } from "./convert.ts";

/** What the Firestore SDK actually hands back. */
const timestamp = (date: Date) => ({ toDate: () => date, seconds: date.getTime() / 1000 });
const reference = (id: string) => ({ id, path: `episodes/${id}`, firestore: {} });

test("timestamps become dates", () => {
  const date = new Date(2026, 8, 14, 9, 0);
  assert.equal(toDate(timestamp(date))?.getTime(), date.getTime());
  assert.equal(toDate(date)?.getTime(), date.getTime());
});

test("a missing or broken date is null, never Invalid Date", () => {
  assert.equal(toDate(null), null);
  assert.equal(toDate(undefined), null);
  assert.equal(toDate("2026-09-14"), null);
  assert.equal(toDate(new Date("nonsense")), null);
  assert.equal(toDate({ toDate: () => "not a date" }), null);
});

test("episodeId is read whether it is a reference or a string", () => {
  assert.equal(toId(reference("seed-ep41")), "seed-ep41");
  assert.equal(toId("seed-ep41"), "seed-ep41");
  assert.equal(toId(null), "");
  assert.equal(toId({}), "");
  assert.equal(toId({ id: 41 }), "");
});

test("scalars fall back rather than producing NaN or undefined", () => {
  assert.equal(toNumber(3), 3);
  assert.equal(toNumber("3"), 0);
  assert.equal(toNumber(Number.NaN), 0);
  assert.equal(toNumber(undefined, 7), 7);

  assert.equal(toBool(true), true);
  assert.equal(toBool("true"), false);
  assert.equal(toBool(undefined), false);

  assert.equal(toStringOrNull("x"), "x");
  assert.equal(toStringOrNull(""), null);
  assert.equal(toStringOrNull(5), null);

  assert.deepEqual(toStringArray(["a", 2, "b"]), ["a", "b"]);
  assert.deepEqual(toStringArray(undefined), []);
});
