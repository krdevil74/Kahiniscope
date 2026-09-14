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
