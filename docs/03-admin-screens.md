# Step 3 — Board, Episodes, episode detail, Team, person detail

Five screens against live Firestore. Every list is a snapshot listener, so a
task ticked on a member's phone clears the admin's board without a refresh,
and two admins never see different numbers.

```bash
cd mobile
npm run verify        # typecheck, unit tests, and a render of every route
```

---

## What the screens are made of

```
src/lib/
  model.ts        the shapes — Firestore Timestamps already converted to Dates
  escalation.ts   the ladder: steps, gaps, countdowns, due labels   (pure)
  completion.ts   percentages, stats, the episode → member → task grouping (pure)
  channels.ts     which channel would actually reach a person        (pure)
  format.ts       initials, air dates, feed times, masked numbers    (pure)
  data.ts         the snapshot hooks
  actions.ts      the writes, and the toast copy that goes with them
  toast.tsx       the dark pill with the yellow dot

src/components/
  AppShell        header + body + tab bar + the floating "+"
  Card, Button, Avatar, HeatBadge, ProgressBar, TabBar, FloatingAdd,
  EmptyState, SectionCaption, AppText, ScreenHeader, Logo
```

The four pure modules hold every rule worth arguing about, and they are unit
tested on their own — 46 tests, no Firebase, no React. The screens are then
mostly layout.

## Rules worth knowing

**The ladder is read, never written down.** `gapFor(remindersSent, plan)` caps
the step index at the last rung, so after the fifth reminder the gap stays at
one day forever. `plan` comes from `settings/global` on every screen, so when
the Notify screen edits it in step 6, every countdown in the app moves with it.
The scheduled function that actually sends runs the same arithmetic against the
same document — if those two ever disagree, the countdown on the board is a
lie.

**Percentages are counted, not stored.** Episode, slate and per-member figures
are all derived from the snapshot on screen. An episode with no tasks is 0%,
not NaN.

**A member who has closed everything is clear, however late they were.**
`worstStep` and the overdue counts ignore done tasks, which is why a badge goes
green rather than staying red once the last box is ticked.

**Channels are derived.** There is no channel field on a user — there cannot
be, because the answer depends on what that person has connected and which
channels are switched on. `bestChannelFor` walks the same fallback order the
sender uses: push → telegram → whatsapp → sms. Nobody reachable at all is
reported as "no channel" rather than hidden, because it means reminders are
going nowhere.

**Dates are formatted by hand.** Hermes ships a cut-down ICU and
`toLocaleDateString` returns "Sept" on one device and "Sep" on another. The
month and weekday names are spelled out in `format.ts`.

## Two departures worth flagging

1. **`episodeId` is read as either a reference or a string.** The data model
   calls it a reference and the demo seed writes one; hand-seeded documents
   tend to carry a plain id. `toId()` accepts both, so neither breaks the
   board.

2. **Nudge moves the ladder but does not yet send.** The channel chain is
   build-order step 8. Today "Nudge now" writes `remindersSent + 1` and
   `lastReminderAt = now`, and shows the designed toast. In step 8 that call is
   replaced by a callable that sends, logs to `reminderLog`, and returns the
   channel that worked. The bookkeeping is deliberately identical either way,
   so the scheduled job's idempotency guard — has a reminder already gone out
   today? — covers a manual nudge too and nobody is chased twice in one day.

## The Episodes screen, rebuilt 3 October

It loaded every episode ever made and every task ever assigned, to put two
numbers in a subtitle and draw one percentage. That is a page which gets slower
every month a channel runs, and the numbers it was adding up are the two now on
the tiles.

**Two halves, and nothing loads until one is tapped.**

| | What it opens | The query |
| --- | --- | --- |
| **In progress** | the slate, air-date order | live, `status in [in_progress, production]` |
| **Broadcast** | one month, newest first | `status in [broadcast, released]` + a `broadcastAt` range |

The two counts on the tiles are `count()` aggregations, so the pair costs the
same whether the channel has made ten episodes or ten thousand. Tasks are
fetched only for the episodes actually listed — two queries, because `episodeId`
is a DocumentReference on everything the Assign form wrote and a string on
everything the seed wrote, and a query on one shape does not match the other.

### `broadcastAt`, and why not `airDate`

Broadcast episodes are filtered by **when they were marked broadcast**, not by
when they were due to air. An episode due on the 20th of August and marked
broadcast on the 3rd of September went out in September, and September is where
somebody looking for it will look.

That date is stamped by the status switch, from the server's clock, and cleared
when an episode is reopened — so one reopened and broadcast again carries the
date it actually went out rather than the first attempt.

### The episodes that have no date

Every episode marked broadcast **before** this shipped has no `broadcastAt`, and
a Firestore query ordered by a field skips the documents that lack it. Those
episodes would be invisible under every month, silently.

So the screen counts them: a third aggregation counts broadcast episodes that do
carry the field, and the difference is reported under the month chips — "4 of 11
broadcast episodes have no broadcast date and will not appear in any month."

`functions/scripts/backfill-broadcast-dates.mjs` closes the gap, dating them from
their air date, and there is a **Backfill broadcast dates** workflow to run it
against production. It leaves any episode that already has a date alone, and
names rather than invents a date for an episode that has no air date either — a
wrong date in a month filter is worse than an episode honestly undatable.

### Both spellings, again

`where status == "in_progress"` does not match an episode stored as
`"production"`, and there are real ones in the live database. Every query here
asks for both spellings, from the one place they are named —
`IN_PROGRESS_VALUES` and `BROADCAST_VALUES` in `src/lib/episode-status.ts`.
Reading a single document still goes through `episodeStatusFrom`, which folds the
old pair into the new one.

And a **third** spelling, if one ever turns up, is in neither half. Both halves
name their values, so an episode stored as something else is in neither query
and appears nowhere on this screen — where before the slate was split, reading
each document folded the unknown value into "in progress" and it was at least
visible. A fourth `count()` over the whole collection is what notices: when the
two halves do not add up to it, the screen says how many episodes are in
neither and how to put them back. `episodeStatusFrom` is not the safety net
here; a query cannot use it.

### One field, not two

The broadcast half asks for a range on `broadcastAt` **and nothing else** — no
`status in [...]` beside it. Two fields need a composite index and one does
not, and in production every query on this screen that wanted a composite
index failed while every query that did not, worked.

It lets nothing in: the status switch stamps `broadcastAt` when an episode
goes out and clears it when one is reopened, so an episode carrying a date in
September went out in September. The status is still checked, in memory, on
the documents that come back.

The same goes for the year filter's floor (one document, ordered by the date)
and for the `dated` count, which is now simply "how many episodes carry a
`broadcastAt`" — an aggregation ordered by a field skips the documents that
lack it, which is the whole point of that number.

### The date on a broadcast card

A card in the broadcast half says **when it went out**, not when it was due:
`Out 03 Oct`. An episode due on the 20th of August and marked broadcast on the
3rd of September went out in September, the month filter above the card has
already filed it under September, and a card showing `Air 20 Aug` next to it
is how somebody decides the filter is broken. Episodes marked broadcast before
the app recorded when fall back to the air date, said as an air date.

### Pink, blue and mint, like everything else

The two halves and their filter chips were the last controls in the app still
drawn in the monochrome they were prototyped in: a white tile and a near-black
one, a black pill when a chip was chosen and a grey-bordered white one when it
was not. Beside the board's three soft-fill tiles they read as a different
product — which is the one thing a single palette exists to prevent.

They take a **flavour** now (`FLAVOURS` in `src/theme/palettes.ts`): the soft
tinted fill with its own hue as the text, and the raw neon for whatever is
open or chosen. **In progress is blue**, because the slate is information;
**Broadcast is mint**, because in this palette mint is what is done; and the
notes under the chips are **pink**, because pink is what wants attention. The
same device, and the same three colours, as the tiles an admin opens on.

A flavour is asked for by name rather than assembled from loose colours at the
call site, so a chip cannot end up with an unreadable pairing — the contrast
is decided once. Three shades were added to the palette to make that true:
`infoDeep` (blue is the one tone that fails on its own tint — 3.2:1, against
money's 4.4 and attention's 4.6) and `onInfoFill` / `onAttentionFill`, which
join `onMoneyFill`. White is never text on a raw fill: 1.4:1 on mint, 2.2 on
blue, 3.0 on pink.

### A year chip is not a filter on its own

Picking a year used to clear the chosen month, and the month is what the
Broadcast half actually queries. The result was an empty list under the heading
**"Nothing that month"** — about a month nobody had picked — which reads
exactly like a filter that has lost the episodes. Picking a year now lands on
the newest month of that year, the same month opening the half lands on.

### A month that will not load is not an empty month

The counts were four aggregations gathered with `Promise.all`, so one refusal
zeroed all four: both tiles read **0**, the undated-episode note went quiet
because `broadcast` and `dated` were both zero, and the screen said the channel
had made nothing. They are gathered with `allSettled` and retried now, and a
count that did not answer is drawn as **—** rather than as a zero nobody can
trust. The month list is retried too, and a month that still will not load says
so instead of reading as a month nothing went out in.

---

## Navigation

The bottom bar is drawn over the content rather than beside it, because in the
design it stays put on pushed screens: episode detail still reads as Episodes,
person detail still reads as Team. `AppShell` owns the header, the bar and the
"+", and the "+" appears only on the five screens the handoff lists.

Routes that step 3 does not own — `/assign`, `/requests`, `/notify` — exist as
marked placeholders so that the FAB, the registrations banner and the fourth
tab all lead somewhere real.

## Trying it

```bash
npm run emulators          # repository root, terminal 1
npm run seed:demo          # terminal 2
```

`seed:demo` refuses to run against anything but the emulators. It writes the
prototype's own slate — three episodes, six approved members, three pending
registrations, eleven tasks spread across the ladder and a morning's reminder
feed — so the screens can be held up against the design side by side. It
creates the matching auth users too, so the claim-sync trigger has someone to
mint claims for.

Then, in `mobile/`, with `EXPO_PUBLIC_USE_EMULATORS=1` in `.env`:

```bash
npm start
```

Sign in as the owner and the board fills.

## Verified

- **46 unit tests** over the escalation ladder, completion arithmetic, channel
  fallback and formatting — including the cap at the fifth rung, the chase
  ordering, and a member whose episode is 50% done.
- `tsc --noEmit` clean; `expo-doctor` 21/21.
- `expo export --platform android` bundles.
- **Every route static-renders.** `npm run verify:render` mounts each screen
  through react-native-web and writes the HTML out, which is how the empty
  states, the header dates, the ladder legend and the tab bar were checked
  without a device. This is a real mount, not a type check: a bad hook or a
  missing provider fails it.
- The demo seed runs against the emulators and the claim-sync trigger fires on
  the users it writes.

Not verified: nothing has run on an Android device, and the static render is a
first paint with empty collections — it does not prove the screens look right
with data in them, or that a list of eleven tasks scrolls the way it should.
That needs `npm run build:dev` and a phone.
