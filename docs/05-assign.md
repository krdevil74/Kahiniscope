# Step 5 — The Assign flow

The only screen that creates work. Person, episode, task, due date, channel —
then one yellow button that names the person it is about to commit.

---

## The form

Built to the design: person pills that go dark with a yellow avatar when
picked, full-width episode rows that fill `#fff8e3` with a `#ffc20a` border and
a filled dot, a two-column grid of task types that inverts to ink on
selection, a −/+ stepper that stops at one day, and three channel tiles.

### The twelve types, and the box under them

`Narration`, `Introduction` and `Special task` joined the original nine on
30 September, and under the grid there is a dashed **Something else** chip with
a text box behind it. `Task.type` was always a plain string rather than a union,
so a typed-in type is a task like any other — it reads back in reminders, on the
board and on a payment row, and it is paid as a figure the admin types.

The box exists because the alternative is shipping a build every time this
channel invents a kind of work. What it produces is normalised
(`normaliseTaskType` in `src/lib/assign.ts`): trimmed, inner whitespace
collapsed onto one line, capped at 40 characters. One line because the type ends
up inside a reminder sentence; 40 characters because it is a label, not a
description. Only whitespace produces nothing, which keeps the submit button
saying "Pick a task".

**`Narration` is the one that is priced.** It maps to the per-minute narration
rate an artist already carries, so approving it asks no unit question —
`Voice recording` still does, because nothing in that task says whether it was a
character or a read. `Introduction` and `Special task`, like a typed-in type, are
a figure somebody decides. The mapping lives in `unitsForTaskType`, in both
`mobile/src/lib/payments.ts` and `functions/src/payments.ts`, tested against the
same examples on both sides.

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

## Deleting work

Added 3 October, because the only way back from a mistyped episode or a task
assigned to the wrong person was the Firebase console.

Both are Cloud Functions (`functions/src/removal.ts`), and `firestore.rules` now
refuses the direct delete for **both** — including for an admin, who could delete
a task directly until this.

| | Where | Guard |
| --- | --- | --- |
| A task | the × on its row, in episode detail | refused once the work has been accepted |
| An episode | the foot of the episode screen | refused if any task on it has been accepted |

**The line is money, and it is not a warning to click through.** Accepting work
opens a payment record that names the task, so deleting an accepted task leaves a
payment pointing at nothing — an amount owed to somebody for a job that is no
longer in the database. The way to get finished work off the board is to mark the
episode **broadcast**, which keeps every record and stops it being offered for new
tasks.

Neither check could live in a rule. For a task, a rule cannot ask "does a payment
name this task" — payment ids are generated, so there is no path to construct.
For an episode, Firestore does not cascade at all: `episodes/EP-12` would go and
`episodes/EP-12/private/script` would stay, reachable and belonging to nothing,
with the tasks pointing at an episode that is not there. So `deleteEpisode`
removes the tasks, then everything under `private/` — listed rather than named,
so a document added later is not left behind — then the episode. It looks for
tasks under **both** shapes of `episodeId`, because a query on a string does not
match a reference, and asking once would delete half an episode.

Confirmation is two taps rather than a dialog, the same pattern as the sign-out
pill, because this app has no modals anywhere. The episode's button names what
goes with it ("Delete it and 9 tasks — tap again") since that is the part nobody
expects, and it disarms itself after a few seconds rather than lying in wait for
the next thumb.

---

## Verified

- **14 new unit tests** (64 in `mobile/` now) over the stepper's floor, the
  incomplete-draft messages, due-date arithmetic across a month boundary, the
  ladder preview's heights, the ladder sentence for non-standard plans, and the
  next-episode-code logic including a slate that is out of order.
- **3 new rules tests** that write a task *exactly* as the form does — document
  reference for `episodeId`, `serverTimestamp()` for `assignedAt` — read it
  back, confirm the assignee can see and tick it, and confirm a member cannot
  assign work to themselves or anyone else. Same for creating an episode.
- The whole form static-renders: every task type, the stepper, the ladder
  at `7d 4d 3d 2d 1d` with its sentence, the three channel tiles, and the
  button in its "Pick a person" state.

Deleting is covered by **7 unit tests** on what may go and what the button says,
**10 emulator tests** on both doors — the cascade reaching the script and the
roster, both shapes of `episodeId` being found, accepted work refused with nothing
on the episode touched, and a member getting nowhere by either route — and a
**rules test** that the direct delete is now shut for an admin too.

Also refactored: the Firestore value conversion moved to `src/lib/convert.ts`
and is now duck-typed rather than using `instanceof`, which survives two copies
of the SDK in one bundle — and is unit tested, including the reference-or-string
reading of `episodeId` that the demo seed and the Assign form exercise from
opposite ends.

Not verified on a device. This screen is mostly tap targets and a keyboard,
which is what a phone is for.
