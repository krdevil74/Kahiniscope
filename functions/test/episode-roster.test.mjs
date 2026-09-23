import test from "node:test";
import assert from "node:assert/strict";

import { affectedEpisodes, episodeIdOf, rosterFrom } from "../lib/episode-roster.js";

test("a new task touches the episode it was raised against", () => {
  assert.deepEqual(affectedEpisodes(undefined, { episodeId: "e1" }), ["e1"]);
});

test("a deleted task touches the episode it was on", () => {
  assert.deepEqual(affectedEpisodes({ episodeId: "e1" }, undefined), ["e1"]);
});

test("a task moved between episodes touches both", () => {
  // Both rosters are wrong until they are rewritten: the old episode may have
  // lost its only task for that person, the new one has gained one.
  assert.deepEqual(
    affectedEpisodes({ episodeId: "e1" }, { episodeId: "e2" }).sort(),
    ["e1", "e2"]
  );
});

test("an edit that leaves the episode alone names it once, not twice", () => {
  assert.deepEqual(
    affectedEpisodes({ episodeId: "e1", assigneeUid: "a" }, { episodeId: "e1", assigneeUid: "b" }),
    ["e1"]
  );
});

test("a task with no episode on it is not an episode", () => {
  assert.deepEqual(affectedEpisodes({}, {}), []);
  assert.deepEqual(affectedEpisodes({ episodeId: "" }, { episodeId: null }), []);
  assert.deepEqual(affectedEpisodes(undefined, undefined), []);
  assert.deepEqual(affectedEpisodes({ episodeId: 7 }, { episodeId: {} }), []);
});

test("the roster is the distinct assignees, sorted so writes are stable", () => {
  assert.deepEqual(
    rosterFrom([{ assigneeUid: "u2" }, { assigneeUid: "u1" }, { assigneeUid: "u2" }]),
    ["u1", "u2"]
  );
});

test("someone with three tasks on an episode appears once", () => {
  assert.deepEqual(
    rosterFrom([{ assigneeUid: "u1" }, { assigneeUid: "u1" }, { assigneeUid: "u1" }]),
    ["u1"]
  );
});

test("an unassigned task puts nobody on the roster", () => {
  assert.deepEqual(rosterFrom([{}, { assigneeUid: "" }, { assigneeUid: null }]), []);
  assert.deepEqual(rosterFrom([]), []);
});

test("a task pointing at its episode by reference is read the same as one by id", () => {
  // Every task the app writes carries a DocumentReference, not a string — see
  // createTask in the app. A trigger that understood only strings would build
  // no roster at all, and no member would ever see a script.
  const ref = { id: "e1", path: "episodes/e1" };
  assert.deepEqual(affectedEpisodes(undefined, { episodeId: ref }), ["e1"]);
  assert.deepEqual(affectedEpisodes({ episodeId: ref }, { episodeId: "e1" }), ["e1"]);
  assert.deepEqual(episodeIdOf(ref), "e1");
  assert.deepEqual(episodeIdOf("e1"), "e1");
  assert.deepEqual(episodeIdOf(null), "");
  assert.deepEqual(episodeIdOf({}), "");
  assert.deepEqual(episodeIdOf({ id: 7 }), "");
});
