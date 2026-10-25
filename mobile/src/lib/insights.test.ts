import assert from "node:assert/strict";
import test from "node:test";

import { periodLabel, periodRange, rankPayments, samePeriod } from "./insights.ts";
import type { Payment } from "./payments.ts";

function paid(overrides: Partial<Payment>): Payment {
  return {
    id: "p1",
    taskId: "t1",
    uid: "u1",
    episodeId: "ep41",
    taskType: "Voice recording",
    status: "paid",
    unit: "voice-narration",
    quantity: null,
    rate: null,
    estimatedAmount: null,
    finalAmount: 0,
    recordingMinutes: null,
    wordCount: null,
    comment: null,
    approvedAt: null,
    paidAt: new Date(2026, 7, 10),
    settledFromAdvance: false,
    proofAttachedAt: null,
    proofExpiresAt: null,
    ...overrides,
  };
}

const PAYMENTS = [
  paid({ id: "a", uid: "rizu", episodeId: "ep1", taskType: "Voice", finalAmount: 400 }),
  paid({ id: "b", uid: "rizu", episodeId: "ep2", taskType: "Voice", finalAmount: 300 }),
  paid({ id: "c", uid: "nabanita", episodeId: "ep1", taskType: "Script", finalAmount: 900 }),
  paid({ id: "d", uid: "ankita", episodeId: "ep2", taskType: "Cover", finalAmount: 150 }),
  paid({ id: "e", uid: "ankita", episodeId: "ep2", taskType: "Cover", finalAmount: 150 }),
  paid({ id: "f", uid: "ankita", episodeId: "ep3", taskType: "Cover", finalAmount: 150 }),
];

test("the most paid people, top first", () => {
  const result = rankPayments(PAYMENTS, "total", "person", 3);
  assert.deepEqual(
    result.rows.map((r) => [r.key, r.value]),
    [
      ["nabanita", 900],
      ["rizu", 700],
      ["ankita", 450],
    ]
  );
  assert.equal(result.total, 2050);
  assert.equal(result.payments, 6);
});

test("only the top few are kept, but the number of groups is still known", () => {
  const result = rankPayments(PAYMENTS, "total", "person", 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.groups, 3);
});

test("the most spent on one episode", () => {
  const [top] = rankPayments(PAYMENTS, "total", "episode", 1).rows;
  assert.deepEqual([top.key, top.value, top.count], ["ep1", 1300, 2]);
});

test("counting payments ranks on how many, not how much", () => {
  const [top] = rankPayments(PAYMENTS, "count", "person", 1).rows;
  assert.deepEqual([top.key, top.value, top.total], ["ankita", 3, 450]);
});

test("the biggest single payment per group", () => {
  const rows = rankPayments(PAYMENTS, "largest", "person", 3).rows;
  assert.deepEqual(
    rows.map((r) => [r.key, r.value]),
    [
      ["nabanita", 900],
      ["rizu", 400],
      ["ankita", 150],
    ]
  );
});

test("ties go to more payments, then the key, so the order is stable", () => {
  const rows = rankPayments(
    [
      paid({ id: "1", uid: "b", finalAmount: 300 }),
      paid({ id: "2", uid: "a", finalAmount: 300 }),
      paid({ id: "3", uid: "c", finalAmount: 150 }),
      paid({ id: "4", uid: "c", finalAmount: 150 }),
    ],
    "total",
    "person",
    3
  ).rows;
  assert.deepEqual(rows.map((r) => r.key), ["c", "a", "b"]);
});

test("a payment with no final figure adds nothing", () => {
  const result = rankPayments([paid({ finalAmount: null })], "total", "person", 3);
  assert.equal(result.total, 0);
  assert.equal(result.rows[0].count, 1);
});

test("nothing paid is an empty answer, not an error", () => {
  const result = rankPayments([], "total", "episode", 3);
  assert.deepEqual(result, { rows: [], groups: 0, total: 0, payments: 0 });
});

const NOW = new Date(2026, 9, 26, 15, 0); // 26 October 2026

test("the last three months include this one, from the 1st of August", () => {
  const { start, end } = periodRange({ kind: "recent", months: 3 }, NOW);
  assert.deepEqual(start, new Date(2026, 7, 1));
  assert.deepEqual(end, new Date(2026, 10, 1));
});

test("last month is the whole calendar month before this one", () => {
  const { start, end } = periodRange({ kind: "lastMonth" }, NOW);
  assert.deepEqual(start, new Date(2026, 8, 1));
  assert.deepEqual(end, new Date(2026, 9, 1));
  assert.equal(periodLabel({ kind: "lastMonth" }, NOW), "Last month (September 2026)");
});

test("last month in January is December of the year before", () => {
  const { start } = periodRange({ kind: "lastMonth" }, new Date(2027, 0, 5));
  assert.deepEqual(start, new Date(2026, 11, 1));
});

test("a picked month is that month", () => {
  const period = { kind: "month", slot: { year: 2026, month: 8 } } as const;
  const { start, end } = periodRange(period, NOW);
  assert.deepEqual(start, new Date(2026, 7, 1));
  assert.deepEqual(end, new Date(2026, 8, 1));
  assert.equal(periodLabel(period, NOW), "August 2026");
});

test("periods compare by what they cover", () => {
  assert.equal(samePeriod({ kind: "recent", months: 3 }, { kind: "recent", months: 3 }), true);
  assert.equal(samePeriod({ kind: "recent", months: 3 }, { kind: "recent", months: 6 }), false);
  assert.equal(samePeriod({ kind: "lastMonth" }, { kind: "recent", months: 1 }), false);
});
