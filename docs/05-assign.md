# Step 5 — The Assign flow

The only screen that creates work. Person, episode, task, due date, channel —
then one yellow button that names the person it is about to commit.

---

## The form

Built to the design: person pills that go dark with a yellow avatar when
picked, full-width episode rows that fill `#fff8e3` with a `#ffc20a` border and
a filled dot, a two-column grid of the nine task types that inverts to ink on
selection, a −/+ stepper that stops at one day, and three channel tiles.

Two things are shown but not edited here:

- **The reminder ladder.** Five bars rising left to right, each tinted with
  that step's heat colour, over a sentence that restates the ladder in words.
  Both come from `settings/global`, so an admin assigning a task sees what the
  person is actually being committed to — and if the owner changes the ladder
  on the Notify screen, this preview changes with it. It is not editable here
  because the ladder is a property of the whole operation, not of one task.

- **What is still missing.** The submit button reads "Pick a person", then
  "Pick an episode", then "Pick a task", and only then "Assign to Rizu &
  notify". A disabled button that does not say why is a dead end.

Arriving from a person or an episode carries that choice in: person detail's
Assign button and the floating "+" both prefill what is already known.

## What gets written

`assignedAt` is the **server's** clock, not the phone's. It is the start of the
seven-day countdown, and the scheduled job compares it against its own clock —
a phone with the wrong date would otherwise send the first reminder days early,
or never. `episodeId` is written as a document reference, as the data model
specifies.

Choosing a channel sets `preferredChannel` on the task; tapping the chosen tile
again clears it, which puts the task back on the normal fallback chain. The
channel is optional, because the chain falls through regardless.

On submit the app jumps to that episode's detail, where the new task is already
in the list — it arrived through the same snapshot every other screen reads.

## A gap in the handoff: creating episodes

The nine screens in the handoff all assume the slate already exists. None of
them creates an episode — but a task cannot be assigned to an episode that is
not there, and EP-44 has to come from somewhere.

Rather than send the admin to the Firebase console every fortnight, the Episode
group ends with a dashed **New episode** row. It opens inline: code (prefilled
with the next number in the run — EP-41, EP-42, EP-43 → EP-44), the Bengali
title, and an "airs in N days" stepper in weeks. Creating one selects it, and
the form carries on.

This is an addition, not something drawn in the prototype. It is built from the
same tokens and reads as part of the form, but flagging it: **if you would
rather episodes were created somewhere else, this is the piece to move.**

## Verified

- **14 new unit tests** (64 in `mobile/` now) over the stepper's floor, the
  incomplete-draft messages, due-date arithmetic across a month boundary, the
  ladder preview's heights, the ladder sentence for non-standard plans, and the
  next-episode-code logic including a slate that is out of order.
- **3 new rules tests** that write a task *exactly* as the form does — document
  reference for `episodeId`, `serverTimestamp()` for `assignedAt` — read it
  back, confirm the assignee can see and tick it, and confirm a member cannot
  assign work to themselves or anyone else. Same for creating an episode.
- The whole form static-renders: all nine task types, the stepper, the ladder
  at `7d 4d 3d 2d 1d` with its sentence, the three channel tiles, and the
  button in its "Pick a person" state.

Also refactored: the Firestore value conversion moved to `src/lib/convert.ts`
and is now duck-typed rather than using `instanceof`, which survives two copies
of the SDK in one bundle — and is unit tested, including the reference-or-string
reading of `episodeId` that the demo seed and the Assign form exercise from
opposite ends.

Not verified on a device. This screen is mostly tap targets and a keyboard,
which is what a phone is for.
