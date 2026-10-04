import assert from "node:assert/strict";
import test from "node:test";

import {
  broadcastGapNote,
  countLabel,
  listedSummary,
  monthEmptyNote,
  monthUnreadableNote,
  slateSubtitle,
  strandedEpisodes,
  strandedNote,
  tileLabel,
  undatedBroadcast,
} from "./slate.ts";

const SEPTEMBER = { year: 2026, month: 9 };

test("the tiles say which half they are", () => {
  assert.equal(tileLabel("in-progress"), "In progress");
  assert.equal(tileLabel("broadcast"), "Broadcast");
});

test("episodes with no broadcast date are counted, not hidden", () => {
  // They were marked broadcast before the app recorded when, and a query
  // ordered by that field skips them — so a filter that says nothing about
  // them is a filter quietly losing episodes.
  assert.equal(undatedBroadcast(11, 7), 4);
  assert.equal(undatedBroadcast(11, 11), 0);
  // A count that is somehow higher than the total is not a negative gap.
  assert.equal(undatedBroadcast(5, 9), 0);
});

test("the gap is said out loud, with both numbers", () => {
  const note = broadcastGapNote(11, 7);
  assert.match(note ?? "", /4 of 11/);
  assert.match(note ?? "", /no broadcast date/);
  assert.match(note ?? "", /will not appear in any month/);

  assert.match(broadcastGapNote(1, 0) ?? "", /1 of 1 broadcast episode has/, "singular reads");
  // Nothing to say once every episode carries a date.
  assert.equal(broadcastGapNote(11, 11), null);
  assert.equal(broadcastGapNote(0, 0), null);
});

test("an empty month explains itself differently when dates are missing", () => {
  // Without the gap, an empty month is just an empty month.
  assert.match(monthEmptyNote(SEPTEMBER, 11, 11), /Nothing went out in September 2026/);
  assert.match(monthEmptyNote(SEPTEMBER, 11, 11), /another month or year/);

  // With it, "nothing here" might mean "nothing here yet".
  const withGap = monthEmptyNote(SEPTEMBER, 11, 7);
  assert.match(withGap, /4 older episodes have no broadcast date/);

  // And it still reads if no month is chosen at all.
  assert.match(monthEmptyNote(null, 3, 3), /that month/);
});

test("the caption counts what is on screen, not what exists", () => {
  assert.equal(
    listedSummary("in-progress", 6, { done: 48, total: 61 }),
    "6 episodes · 48 of 61 tasks done"
  );
  assert.equal(listedSummary("broadcast", 1, { done: 4, total: 4 }), "1 episode · 4 of 4 tasks done");
  // A new episode with nothing assigned is not 0% — it has no denominator.
  assert.equal(listedSummary("in-progress", 2, { done: 0, total: 0 }), "2 episodes · no tasks yet");
});

test("an empty half says so in its own words", () => {
  assert.equal(listedSummary("in-progress", 0, { done: 0, total: 0 }), "Nothing in progress");
  assert.equal(listedSummary("broadcast", 0, { done: 0, total: 0 }), "Nothing that month");
});

// ---------------------------------------------------------------------------
// Counts that did not answer, and episodes in neither half
// ---------------------------------------------------------------------------

test("a count that could not be had is a dash, never a zero", () => {
  // "0 broadcast" is a statement about the channel. A dash is a statement
  // about the asking, and the two must not look the same on a tile.
  assert.equal(countLabel(0), "0");
  assert.equal(countLabel(11), "11");
  assert.equal(countLabel(null), "—");
  assert.equal(slateSubtitle(4, 11), "4 in progress · 11 broadcast");
  assert.equal(slateSubtitle(null, null), "— in progress · — broadcast");
});

test("the notes stay quiet about numbers they do not have", () => {
  // A gap worked out from a count that failed is not a gap, and saying "4 of
  // — episodes" would be worse than saying nothing.
  assert.equal(undatedBroadcast(null, 7), 0);
  assert.equal(undatedBroadcast(11, null), 0);
  assert.equal(broadcastGapNote(null, 7), null);
  assert.equal(broadcastGapNote(11, null), null);
  assert.match(monthEmptyNote(SEPTEMBER, null, null), /Try another month or year/);
});

test("episodes in neither half are counted and named", () => {
  // Both halves ask for named status spellings, so an episode stored as
  // anything else is in neither query — and before the slate was split it was
  // folded into "in progress" on the phone and at least visible.
  assert.equal(strandedEpisodes(14, 4, 9), 1);
  assert.equal(strandedEpisodes(13, 4, 9), 0);
  assert.equal(strandedEpisodes(14, null, 9), null, "not a gap if a count failed");

  assert.equal(strandedNote(13, 4, 9), null, "nothing to say when they add up");
  assert.equal(strandedNote(14, null, 9), null);

  const one = strandedNote(14, 4, 9) ?? "";
  assert.match(one, /1 episode is in neither half/);
  assert.match(one, /spelling this screen does not know/);
  assert.match(strandedNote(16, 4, 9) ?? "", /3 episodes are in neither half/);
});

test("a month that could not be read says so, and does not read as empty", () => {
  const note = monthUnreadableNote(SEPTEMBER);
  assert.match(note, /September 2026 could not be read/);
  assert.match(note, /nothing has been lost/);
  assert.match(monthUnreadableNote(null), /that month could not be read/);
});
