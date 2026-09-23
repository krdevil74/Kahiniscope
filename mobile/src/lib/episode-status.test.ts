import test from "node:test";
import assert from "node:assert/strict";

import {
  assignableEpisodes,
  countByStatus,
  episodeStatusAction,
  episodeStatusFrom,
  episodeStatusLabel,
  episodeStatusToast,
  isBroadcast,
  isInProgress,
  nextEpisodeStatus,
} from "./episode-status.ts";
import type { Episode } from "./model";

function episode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: "e1",
    code: "EP-41",
    title: "রক্তমুখী নীলা",
    airDate: null,
    status: "in_progress",
    ...overrides,
  };
}

test("anything that is not broadcast is in progress", () => {
  assert.equal(episodeStatusFrom("in_progress"), "in_progress");
  assert.equal(episodeStatusFrom("broadcast"), "broadcast");
  assert.equal(episodeStatusFrom(undefined), "in_progress");
  assert.equal(episodeStatusFrom(null), "in_progress");
  assert.equal(episodeStatusFrom(""), "in_progress");
  assert.equal(episodeStatusFrom(42), "in_progress");
  assert.equal(episodeStatusFrom("nonsense"), "in_progress");
});

test("the two spellings the live database already has are understood", () => {
  // Episodes written before the life cycle existed. "released" means it went
  // out; "production" means it had not.
  assert.equal(episodeStatusFrom("released"), "broadcast");
  assert.equal(episodeStatusFrom("production"), "in_progress");
});

test("the new-task picker is offered only what is still in progress", () => {
  const open = episode({ id: "a" });
  const gone = episode({ id: "b", status: "broadcast" });

  assert.deepEqual(assignableEpisodes([open, gone]).map((e) => e.id), ["a"]);
});

test("filtering does not mutate what it is given", () => {
  const list = [episode({ id: "a" }), episode({ id: "b", status: "broadcast" })];
  assignableEpisodes(list);
  assert.deepEqual(list.map((e) => e.id), ["a", "b"]);
});

test("every episode broadcast leaves nothing to assign against", () => {
  assert.deepEqual(assignableEpisodes([episode({ status: "broadcast" })]), []);
  assert.deepEqual(assignableEpisodes([]), []);
});

test("the predicates are opposites", () => {
  const open = episode();
  const gone = episode({ status: "broadcast" });
  assert.equal(isInProgress(open), true);
  assert.equal(isBroadcast(open), false);
  assert.equal(isInProgress(gone), false);
  assert.equal(isBroadcast(gone), true);
});

test("the button offers the other state, not the current one", () => {
  assert.equal(episodeStatusLabel("in_progress"), "In progress");
  assert.equal(episodeStatusLabel("broadcast"), "Broadcast");
  assert.equal(episodeStatusAction("in_progress"), "Mark broadcast");
  assert.equal(episodeStatusAction("broadcast"), "Reopen");
  assert.equal(nextEpisodeStatus("in_progress"), "broadcast");
  assert.equal(nextEpisodeStatus("broadcast"), "in_progress");
});

test("the toast says what the change did, not that it happened", () => {
  assert.equal(
    episodeStatusToast("EP-41", "broadcast"),
    "EP-41 is broadcast — no new tasks can be raised against it."
  );
  assert.equal(episodeStatusToast("EP-41", "in_progress"), "EP-41 is back in progress.");
});

test("the counts add up to the slate", () => {
  const list = [
    episode({ id: "a" }),
    episode({ id: "b", status: "broadcast" }),
    episode({ id: "c", status: "broadcast" }),
  ];
  assert.deepEqual(countByStatus(list), { inProgress: 1, broadcast: 2 });
  assert.deepEqual(countByStatus([]), { inProgress: 0, broadcast: 0 });
});
