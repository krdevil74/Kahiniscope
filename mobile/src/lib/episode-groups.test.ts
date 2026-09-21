import assert from "node:assert/strict";
import test from "node:test";

import { groupByEpisode, groupSummary } from "./episode-groups.ts";
import type { Episode, Task } from "./model.ts";

const NOW = new Date("2026-09-21T09:00:00Z");

function task(overrides: Partial<Task>): Task {
  return {
    id: "t",
    episodeId: "ep41",
    assigneeUid: "u1",
    type: "Voice recording",
    dueDate: new Date("2026-09-28T09:00:00Z"),
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

function episode(id: string, code: string): Episode {
  return { id, code, title: "রক্তমুখী নীলা", airDate: null, status: "production" };
}

test("tasks are gathered under the episode they belong to", () => {
  const groups = groupByEpisode(
    [
      task({ id: "a", episodeId: "ep41" }),
      task({ id: "b", episodeId: "ep42" }),
      task({ id: "c", episodeId: "ep41" }),
    ],
    [episode("ep41", "EP-41"), episode("ep42", "EP-42")],
    NOW
  );
  assert.equal(groups.length, 2);
  const ep41 = groups.find((g) => g.episodeId === "ep41")!;
  assert.deepEqual(ep41.tasks.map((t) => t.id), ["a", "c"], "order inside a group is untouched");
  assert.equal(ep41.code, "EP-41");
});

test("the episode in the most trouble comes first", () => {
  const groups = groupByEpisode(
    [
      task({ id: "calm", episodeId: "ep42", remindersSent: 0 }),
      task({ id: "hot", episodeId: "ep41", remindersSent: 4 }),
    ],
    [episode("ep41", "EP-41"), episode("ep42", "EP-42")],
    NOW
  );
  assert.deepEqual(groups.map((g) => g.episodeId), ["ep41", "ep42"]);
  assert.equal(groups[0].worstStep, 4);
});

test("at the same heat, the one with more overdue work comes first", () => {
  const late = new Date("2026-09-18T09:00:00Z");
  const groups = groupByEpisode(
    [
      task({ id: "a", episodeId: "ep42", dueDate: late }),
      task({ id: "b", episodeId: "ep42", dueDate: late }),
      task({ id: "c", episodeId: "ep41" }),
    ],
    [episode("ep41", "EP-41"), episode("ep42", "EP-42")],
    NOW
  );
  assert.equal(groups[0].episodeId, "ep42");
  assert.equal(groups[0].overdue, 2);
  assert.equal(groups[1].overdue, 0);
});

test("work whose episode is gone is still somebody's problem", () => {
  const groups = groupByEpisode([task({ episodeId: "deleted" })], [], NOW);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].episode, null);
  assert.equal(groups[0].code, "No episode");
});

test("nothing to chase is no groups, not an empty group", () => {
  assert.deepEqual(groupByEpisode([], [episode("ep41", "EP-41")], NOW), []);
});

test("the summary counts what is open and says how much is late", () => {
  const late = new Date("2026-09-18T09:00:00Z");
  const [group] = groupByEpisode(
    [task({ id: "a", dueDate: late }), task({ id: "b" })],
    [episode("ep41", "EP-41")],
    NOW
  );
  assert.equal(groupSummary(group), "2 open · 1 overdue");
});

test("nothing late reads as nothing late, not as zero overdue", () => {
  const [group] = groupByEpisode([task({})], [episode("ep41", "EP-41")], NOW);
  assert.equal(groupSummary(group), "1 open");
});
