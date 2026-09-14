import test from "node:test";
import assert from "node:assert/strict";

import {
  airLabel,
  boardDateLabel,
  feedTimeLabel,
  firstName,
  initials,
  maskPhone,
  pluralise,
  relativeTime,
} from "./format.ts";

const NOW = new Date(2026, 8, 14, 9, 2, 0);

test("initials are two letters", () => {
  assert.equal(initials("Rizu Ahmed"), "RA");
  assert.equal(initials("Mahi Chowdhury"), "MC");
  assert.equal(initials("Shuvo"), "S");
  assert.equal(initials("Arif  Hossain  Khan"), "AH");
  assert.equal(initials(""), "");
  assert.equal(initials(null), "");
});

test("first names, for the toasts and the pills", () => {
  assert.equal(firstName("Rizu Ahmed"), "Rizu");
  assert.equal(firstName("  Piyali  Sen "), "Piyali");
});

test("air dates read as the cards write them", () => {
  assert.equal(airLabel(new Date(2026, 8, 20)), "Air 20 Sep");
  assert.equal(airLabel(new Date(2026, 9, 4)), "Air 04 Oct");
  assert.equal(airLabel(null), "no air date");
});

test("the board subtitle is the long date", () => {
  assert.equal(boardDateLabel(new Date(2026, 8, 14)), "Monday, 14 September");
});

test("the feed shows a time today, then yesterday, then a date", () => {
  assert.equal(feedTimeLabel(new Date(2026, 8, 14, 9, 2), NOW), "09:02");
  assert.equal(feedTimeLabel(new Date(2026, 8, 14, 8, 58), NOW), "08:58");
  assert.equal(feedTimeLabel(new Date(2026, 8, 13, 17, 0), NOW), "Yesterday");
  assert.equal(feedTimeLabel(new Date(2026, 8, 9, 17, 0), NOW), "9 Sep");
  assert.equal(feedTimeLabel(null, NOW), "—");
});

test("registration times read the way the requests screen writes them", () => {
  assert.equal(relativeTime(new Date(2026, 8, 14, 7, 2), NOW), "2 hours ago");
  assert.equal(relativeTime(new Date(2026, 8, 14, 8, 32), NOW), "30 minutes ago");
  assert.equal(relativeTime(new Date(2026, 8, 13, 7, 0), NOW), "yesterday");
  assert.equal(relativeTime(new Date(2026, 8, 11, 7, 0), NOW), "3 days ago");
  assert.equal(relativeTime(new Date(2026, 8, 14, 9, 1, 30), NOW), "just now");
});

test("phone numbers are masked to what the design shows", () => {
  assert.equal(maskPhone("+8801712344192"), "+880 17•• ••4192");
  assert.equal(maskPhone(null), "no number");
});

test("plurals", () => {
  assert.equal(pluralise(1, "task"), "1 task");
  assert.equal(pluralise(3, "task"), "3 tasks");
  assert.equal(pluralise(2, "person", "people"), "2 people");
});
