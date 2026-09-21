import assert from "node:assert/strict";
import test from "node:test";

import { approveLabel, craftLabel, craftsFrom, MAX_CRAFTS, toggleCraft } from "./crafts.ts";

test("a record written before crafts existed reads as a list of one", () => {
  assert.deepEqual(craftsFrom(undefined, "Voice"), ["Voice"]);
});

test("a record with neither reads as nobody has said yet", () => {
  assert.deepEqual(craftsFrom(undefined, undefined), []);
  assert.deepEqual(craftsFrom(undefined, ""), []);
});

test("the list wins over the old single value", () => {
  assert.deepEqual(craftsFrom(["Voice", "Editing"], "Script"), ["Voice", "Editing"]);
});

test("junk in the array is dropped rather than rendered", () => {
  assert.deepEqual(craftsFrom(["Voice", "", 7, null, "Editing"]), ["Voice", "Editing"]);
});

test("duplicates collapse", () => {
  assert.deepEqual(craftsFrom(["Voice", "Voice"]), ["Voice"]);
});

test("the stored list is capped on the way in, not only on the way out", () => {
  const many = ["Script", "Translation", "Voice", "Post / mix", "Graphics", "Editing"];
  assert.equal(craftsFrom(many).length, MAX_CRAFTS);
});

test("the label joins, and never comes back empty", () => {
  assert.equal(craftLabel(["Voice", "Editing"]), "Voice · Editing");
  assert.equal(craftLabel([]), "no craft");
});

test("the approve button counts rather than listing when there are several", () => {
  assert.equal(approveLabel([]), "Approve");
  assert.equal(approveLabel(["Voice"]), "Approve as Voice");
  assert.equal(approveLabel(["Voice", "Editing"]), "Approve as Voice +1");
});

test("toggling adds, removes, and keeps the offered order", () => {
  assert.deepEqual(toggleCraft([], "Voice"), ["Voice"]);
  assert.deepEqual(toggleCraft(["Voice"], "Voice"), []);
  // Script is offered before Voice, so it lands first however it was tapped.
  assert.deepEqual(toggleCraft(["Voice"], "Script"), ["Script", "Voice"]);
});

test("toggling cannot exceed the cap", () => {
  const full = ["Script", "Translation", "Voice", "Post / mix", "Graphics"];
  assert.deepEqual(toggleCraft(full, "Editing"), full);
  // Removing still works when full — otherwise the cap would be a trap.
  assert.equal(toggleCraft(full, "Voice").length, MAX_CRAFTS - 1);
});
