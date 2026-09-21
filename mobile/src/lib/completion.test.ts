import test from "node:test";
import assert from "node:assert/strict";

import { EMPTY_RATES } from "./model.ts";
import {
  boardStats,
  byAirDate,
  byDueDate,
  completionOf,
  membersInEpisode,
  openEpisodeCodes,
  overdueCount,
  worstStep,
} from "./completion.ts";
import type { Task, TeamMember } from "./model";

const NOW = new Date(2026, 8, 14, 9, 0, 0);

function daysFromNow(days: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return d;
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    episodeId: "e1",
    assigneeUid: "u1",
    type: "Voice recording",
    dueDate: daysFromNow(3),
    status: "open",
    done: false,
    submittedAt: null,
    submissionNote: null,
    rejectedAt: null,
    rejectionNote: null,
    rejectedCount: 0,
    doneAt: null,
    remindersSent: 0,
    lastReminderAt: null,
    assignedAt: daysFromNow(-1),
    preferredChannel: null,
    ...overrides,
  };
}

function member(uid: string, name: string): TeamMember {
  return {
    uid,
    name,
    email: `${uid}@gmail.com`,
    phone: "+8801712344192",
    telegramChatId: null,
    accountless: false,
    rates: EMPTY_RATES,
    balance: 0,
  crafts: ["Voice"],
    status: "approved",
    role: "member",
    fcmTokens: [],
    note: null,
    preferredChannel: null,
    createdAt: null,
  };
}

test("percentages are counted, never stored", () => {
  assert.deepEqual(completionOf([task({ done: true }), task(), task(), task()]), {
    done: 1,
    total: 4,
    percent: 25,
  });
});

test("an episode with no tasks is 0%, not NaN", () => {
  assert.deepEqual(completionOf([]), { done: 0, total: 0, percent: 0 });
});

test("percentages round to whole numbers", () => {
  assert.equal(completionOf([task({ done: true }), task(), task()]).percent, 33);
  assert.equal(completionOf([task({ done: true }), task({ done: true }), task()]).percent, 67);
});

test("the three stat cells count what they say", () => {
  const tasks = [
    task({ dueDate: daysFromNow(-4) }),
    task({ dueDate: daysFromNow(-1) }),
    task({ dueDate: daysFromNow(2) }),
    task({ dueDate: daysFromNow(-9), done: true }),
  ];
  assert.deepEqual(boardStats(tasks, NOW), { overdue: 2, open: 3, done: 1 });
});

test("a member who has closed everything is clear, however late they were", () => {
  const tasks = [task({ done: true, remindersSent: 4 }), task({ done: true, remindersSent: 2 })];
  assert.equal(worstStep(tasks), 0);
  assert.equal(overdueCount([task({ dueDate: daysFromNow(-9), done: true })], NOW), 0);
});

test("the worst open step is what tints the badge", () => {
  assert.equal(worstStep([task({ remindersSent: 1 }), task({ remindersSent: 3 }), task({ done: true, remindersSent: 4 })]), 3);
});

test("episode detail segments into members, each with their own percentage", () => {
  const team = [member("u1", "Rizu Ahmed"), member("u2", "Tanmoy Das"), member("u3", "Nobody Here")];
  const tasks = [
    task({ assigneeUid: "u1", done: true }),
    task({ assigneeUid: "u1", dueDate: daysFromNow(-4), remindersSent: 3 }),
    task({ assigneeUid: "u2", done: true }),
  ];

  const slices = membersInEpisode(tasks, team, NOW);

  assert.deepEqual(slices.map((s) => s.member.uid), ["u1", "u2"], "u3 has nothing here");
  assert.equal(slices[0].completion.percent, 50);
  assert.equal(slices[0].overdue, 1);
  assert.equal(slices[0].worstStep, 3);
  assert.equal(slices[0].allDone, false);
  assert.equal(slices[1].completion.percent, 100);
  assert.equal(slices[1].allDone, true);
});

test("episode codes list each episode once, open work only", () => {
  const tasks = [
    task({ assigneeUid: "u1", episodeId: "e1" }),
    task({ assigneeUid: "u1", episodeId: "e1" }),
    task({ assigneeUid: "u1", episodeId: "e2" }),
    task({ assigneeUid: "u1", episodeId: "e3", done: true }),
    task({ assigneeUid: "u2", episodeId: "e9" }),
  ];
  const codes: Record<string, string> = { e1: "EP-41", e2: "EP-42", e3: "EP-43", e9: "EP-99" };
  assert.deepEqual(openEpisodeCodes(tasks, "u1", (id) => codes[id]), ["EP-41", "EP-42"]);
});

test("episodes run in air-date order, undated ones last", () => {
  const episodes = [
    { code: "EP-43", airDate: daysFromNow(20) },
    { code: "EP-41", airDate: daysFromNow(6) },
    { code: "EP-99", airDate: null },
    { code: "EP-42", airDate: daysFromNow(13) },
  ];
  assert.deepEqual(byAirDate(episodes).map((e) => e.code), ["EP-41", "EP-42", "EP-43", "EP-99"]);
});

test("a member's own list puts open work first, most overdue at the top", () => {
  const tasks = [
    task({ id: "done", done: true, dueDate: daysFromNow(-20) }),
    task({ id: "soon", dueDate: daysFromNow(2) }),
    task({ id: "late", dueDate: daysFromNow(-5) }),
  ];
  assert.deepEqual(byDueDate(tasks, NOW).map((t) => t.id), ["late", "soon", "done"]);
});
