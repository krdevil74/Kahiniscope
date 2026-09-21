import assert from "node:assert/strict";
import test from "node:test";

import {
  columnMotion,
  dealColumns,
  POSTER_RATIO,
  postersPerColumn,
  rotatedCover,
} from "./poster-wall.ts";

test("posters are dealt round-robin, so genres do not clump into one column", () => {
  // The catalogue is ordered mystery, horror, comedy, love and repeats.
  const posters = ["mystery", "horror", "comedy", "love"];
  const columns = dealColumns(posters, 2, 2);
  assert.deepEqual(columns, [
    ["mystery", "comedy"],
    ["horror", "love"],
  ]);
});

test("a column longer than the catalogue wraps rather than running out", () => {
  const columns = dealColumns(["a", "b"], 1, 5);
  assert.deepEqual(columns, [["a", "b", "a", "b", "a"]]);
});

test("nothing to deal is not a crash", () => {
  assert.deepEqual(dealColumns([], 3, 4), []);
  assert.deepEqual(dealColumns(["a"], 0, 4), []);
  assert.deepEqual(dealColumns(["a"], 3, 0), []);
});

test("a column covers the screen with one to spare, or the wrap shows a gap", () => {
  // Ten posters of 100 would cover exactly; the spare one hides the seam.
  assert.equal(postersPerColumn(1000, 100), 11);
  // A part-filled last slot still has to be counted.
  assert.equal(postersPerColumn(1050, 100), 12);
});

test("even a tiny screen gets enough posters to loop", () => {
  assert.equal(postersPerColumn(10, 100), 2);
  assert.equal(postersPerColumn(1000, 0), 0);
});

test("the tilted wall is built big enough to keep its corners off screen", () => {
  const square = rotatedCover(100, 100, 45);
  // A square turned 45° needs its diagonal in both directions.
  assert.equal(square.width, 142);
  assert.equal(square.height, 142);
});

test("no tilt asks for no extra", () => {
  assert.deepEqual(rotatedCover(390, 812, 0), { width: 390, height: 812 });
});

test("the tilt direction does not change how much room it needs", () => {
  assert.deepEqual(rotatedCover(390, 812, -9), rotatedCover(390, 812, 9));
});

test("columns never share a speed, or the wall reads as one sliding sheet", () => {
  const speeds = [0, 1, 2].map((i) => columnMotion(i).durationMs);
  assert.equal(new Set(speeds).size, speeds.length);
});

test("columns alternate direction", () => {
  assert.equal(columnMotion(0).up, true);
  assert.equal(columnMotion(1).up, false);
  assert.equal(columnMotion(2).up, true);
});

test("the drift is slow enough to be background", () => {
  // Anything under ten seconds for a full column is motion somebody has to
  // look away from while signing in.
  for (const i of [0, 1, 2]) assert.ok(columnMotion(i).durationMs >= 20_000);
});

test("posters stay 16:9", () => {
  assert.equal(Math.round(160 * POSTER_RATIO), 90);
});
