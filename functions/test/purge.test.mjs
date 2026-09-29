/**
 * The rules the by-hand collection purge obeys.
 *
 * Same reasoning as the retention tests, more so: this one deletes whatever
 * it is pointed at, so what it accepts as a collection and what it accepts as
 * a date are the whole safety story.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  PURGE_TARGETS,
  MIN_AGE_DAYS,
  targetFor,
  startOfDay,
  cutoffFor,
} from "../lib/purge.js";

const NOW = new Date("2026-09-29T09:00:00Z");

test("only the listed collections, and users is not one of them", () => {
  assert.equal(targetFor("reminderLog").dateField, "sentAt");
  assert.equal(targetFor("tasks").dateField, "assignedAt");
  assert.equal(targetFor("episodes").dateField, "airDate");
  assert.equal(targetFor("payments").dateField, "approvedAt");
  assert.equal(targetFor("advances").dateField, "createdAt");

  // A user document is half of an account. Deleting one by date leaves an
  // Auth record that can still sign in and has nothing to sign in to.
  assert.throws(() => targetFor("users"), /not a collection this job will purge/);
  assert.throws(() => targetFor("settings"), /not a collection this job will purge/);

  // A near miss must not quietly become a no-op against Firestore.
  assert.throws(() => targetFor("reminderlog"), /Allowed: /);
  assert.throws(() => targetFor(""), /Allowed: /);
});

test("only episodes carry subcollections, and they are marked", () => {
  // episodes/{id}/private/roster does not go on its own — Firestore never
  // cascades — so this flag is what stops an orphan being left behind.
  for (const target of PURGE_TARGETS) {
    assert.equal(target.hasSubcollections, target.collection === "episodes", target.collection);
  }
});

test("the date is read in Dhaka, not UTC", () => {
  // Midnight on the 1st in Dhaka is 18:00 the previous evening in UTC. Read
  // as UTC instead, the cutoff would take six extra hours of documents.
  assert.equal(startOfDay("2026-04-01").toISOString(), "2026-03-31T18:00:00.000Z");
  assert.equal(startOfDay("2026-01-01").toISOString(), "2025-12-31T18:00:00.000Z");
});

test("the boundary belongs to the day named", () => {
  // "Before 2026-04-01" keeps the 1st and takes the 31st.
  const cutoff = startOfDay("2026-04-01");
  const lateOnTheThirtyFirst = new Date("2026-03-31T17:59:59Z"); // 23:59:59 Dhaka
  const firstMomentOfApril = new Date("2026-03-31T18:00:00Z");

  assert.ok(lateOnTheThirtyFirst < cutoff);
  assert.ok(!(firstMomentOfApril < cutoff));
});

test("a date that is not a date is refused", () => {
  assert.throws(() => startOfDay("01/04/2026"), /YYYY-MM-DD/);
  assert.throws(() => startOfDay("2026-4-1"), /YYYY-MM-DD/);
  assert.throws(() => startOfDay("yesterday"), /YYYY-MM-DD/);

  // Date.UTC would roll these forward rather than complain.
  assert.throws(() => startOfDay("2026-02-31"), /not a real date/);
  assert.throws(() => startOfDay("2026-13-01"), /not a real date/);

  // And a real one still is: 2028 is a leap year.
  assert.equal(startOfDay("2028-02-29").toISOString(), "2028-02-28T18:00:00.000Z");
});

test("a future date is refused before it deletes everything there is", () => {
  // The likeliest typo is the year, and from a future date "everything
  // before this" is the entire collection.
  assert.throws(() => cutoffFor("2027-01-01", NOW), /in the future/);
  assert.throws(() => cutoffFor("2026-09-30", NOW), /in the future/);
});

test("today is refused; a day back is enough", () => {
  // "Everything before today" is the one sensible-looking date that is not.
  // Anything older is a decision, and the dry run is what checks that.
  assert.throws(() => cutoffFor("2026-09-29", NOW), /less than 1 day ago/);

  assert.equal(cutoffFor("2026-09-28", NOW).toISOString(), "2026-09-27T18:00:00.000Z");
  assert.equal(MIN_AGE_DAYS, 1);
});

test("the floor holds at every hour of the day it is refusing", () => {
  // The cutoff is a Dhaka midnight and `now` is an instant, so the floor has
  // to hold from one minute past midnight to one minute to. These are the
  // hours that are still the 29th in Dhaka — 18:00Z is next morning there.
  for (const hour of ["18:01", "23:59"]) {
    const now = new Date(`2026-09-28T${hour}:00Z`); // early on the 29th, Dhaka
    assert.throws(() => cutoffFor("2026-09-29", now), /less than 1 day ago/, hour);
    assert.doesNotThrow(() => cutoffFor("2026-09-28", now), hour);
  }
  for (const hour of ["00:30", "09:00", "17:59"]) {
    const now = new Date(`2026-09-29T${hour}:00Z`); // still the 29th in Dhaka
    assert.throws(() => cutoffFor("2026-09-29", now), /less than 1 day ago/, hour);
    assert.doesNotThrow(() => cutoffFor("2026-09-28", now), hour);
  }
});

test("a date becomes purgeable when Dhaka's day rolls over, not UTC's", () => {
  // 18:00Z is midnight in Dhaka. One minute before, the 29th is today and is
  // refused; one minute after, it is yesterday and goes through. The team's
  // day is the one that counts, because it is the one they are reading off
  // the wall when they type the date.
  assert.throws(
    () => cutoffFor("2026-09-29", new Date("2026-09-29T17:59:00Z")),
    /less than 1 day ago/
  );
  assert.doesNotThrow(() => cutoffFor("2026-09-29", new Date("2026-09-29T18:01:00Z")));
});

test("an ordinary clean-up passes", () => {
  assert.equal(cutoffFor("2025-01-01", NOW).toISOString(), "2024-12-31T18:00:00.000Z");
});
