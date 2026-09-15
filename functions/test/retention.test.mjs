/**
 * The retention rule.
 *
 * This job deletes production data on a schedule, so what it considers old is
 * worth more scrutiny than most things here.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  cutoffFor,
  retentionFrom,
  DEFAULT_RETENTION_DAYS,
  MINIMUM_RETENTION_DAYS,
} from "../lib/retention.js";

const NOW = new Date("2026-09-15T03:00:00Z");

test("a year by default", () => {
  const cutoff = cutoffFor(NOW, DEFAULT_RETENTION_DAYS);
  assert.equal(cutoff.toISOString().slice(0, 10), "2025-09-15");
  assert.ok(cutoff < NOW);
});

test("the settings document decides, within limits", () => {
  assert.deepEqual(retentionFrom({ retention: { enabled: true, days: 180 } }), {
    enabled: true,
    days: 180,
  });
  assert.deepEqual(retentionFrom({}), { enabled: true, days: DEFAULT_RETENTION_DAYS });
  assert.deepEqual(retentionFrom(undefined), { enabled: true, days: DEFAULT_RETENTION_DAYS });
});

test("a dangerously short window is clamped, not obeyed", () => {
  // A fat-fingered 3 would otherwise delete the current slate on the next run.
  assert.equal(retentionFrom({ retention: { days: 3 } }).days, MINIMUM_RETENTION_DAYS);
  assert.equal(retentionFrom({ retention: { days: 0 } }).days, MINIMUM_RETENTION_DAYS);
  assert.equal(retentionFrom({ retention: { days: -400 } }).days, MINIMUM_RETENTION_DAYS);

  // And the clamp holds at the point of use too, not only when reading.
  const cutoff = cutoffFor(NOW, 1);
  const ninetyDaysAgo = new Date(NOW.getTime() - MINIMUM_RETENTION_DAYS * 86_400_000);
  assert.equal(cutoff.getTime(), ninetyDaysAgo.getTime());
});

test("junk in the settings falls back to the default rather than to zero", () => {
  assert.equal(retentionFrom({ retention: { days: "soon" } }).days, DEFAULT_RETENTION_DAYS);
  assert.equal(retentionFrom({ retention: { days: Number.NaN } }).days, DEFAULT_RETENTION_DAYS);
  assert.equal(cutoffFor(NOW, Number.NaN).toISOString().slice(0, 10), "2025-09-15");
});

test("it can be switched off, but only explicitly", () => {
  assert.equal(retentionFrom({ retention: { enabled: false } }).enabled, false);
  // Anything else is on: unbounded growth is the thing that costs money.
  assert.equal(retentionFrom({ retention: {} }).enabled, true);
  assert.equal(retentionFrom({ retention: { enabled: "no" } }).enabled, true);
});

test("the cutoff moves with the clock", () => {
  const later = new Date("2027-01-01T03:00:00Z");
  assert.ok(cutoffFor(later, 365) > cutoffFor(NOW, 365));
  assert.equal(cutoffFor(later, 365).toISOString().slice(0, 10), "2026-01-01");
});
