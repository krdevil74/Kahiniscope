# Step 7 — The member app, both states

What a team member sees. Which of the two states they get is decided by the
claim on their token, in `app/index.tsx` — never by the app itself.

```
not signed in      → sign-in
signed in, pending → app/pending.tsx   registration form, then the holding screen
signed in, approved→ app/my-tasks.tsx  their own work
admin or owner     → app/board.tsx
```

---

## Approved: their own work

A yellow header — this is their app, not the admin's — with the date in
monospace, then `2 tasks waiting on you` or `All clear`, then one card per
task: a 4px heat bar in that step's colour, the episode code, the heat badge,
the task type at 17/600, the Bengali title, the note chip
(`4d overdue · next reminder today`), and one full-width button.

**Mark done** is ink with yellow text. Once closed it becomes an outlined
**Reopen task** and the title is struck through — reopening stays possible but
is never the obvious thing to tap.

The member's list is their own slice and nothing else. That is not a filter
applied on this screen: the security rules reject any query that does not ask
for `assigneeUid == uid`, so the screen is asking for the only thing it is
allowed to have. Marking done writes `done` and `doneAt`, the only two fields a
member may touch — `remindersSent` and `lastReminderAt` stay server-owned.

Marking done stops the reminders immediately, with no cancel step: the
scheduled job only ever looks at tasks where `done` is false.

## Pending: the other state

Built in step 4 and unchanged here — the registration form (craft, phone, a
note in their own words), then the holding screen with the 76px mark, the
status pill and the promise that they will be messaged when it is approved.

## Two corrections to the prototype

1. **The header's 60px top padding was the iOS frame's notch.** On Android,
   edge to edge, the device reports how much room the status bar needs, so the
   header uses `insets.top + 16`. On a phone with no notch the prototype's
   value would have left a band of yellow; on one with a punch-hole it might
   not have been enough.

2. **The closing card names the real chain.** The prototype says "Reminders
   arrive on WhatsApp, then Telegram, then SMS"; the escalation engine tries
   push first — see `docs/06-notify.md` for that contradiction and how it was
   resolved. The sentence is now generated from the channels that are actually
   switched on, in the order they are actually tried, so it cannot drift from
   the Notify screen. With SMS off, as it ships, it reads "Reminders arrive on
   push, then Telegram, then WhatsApp."

## Seeing it locally

The demo seed now links a Google identity to each seeded person, so the app's
emulator sign-in lands on **that** account — the one the seeded tasks are
assigned to — rather than minting a fresh pending registration. The sign-in
screen offers two buttons in a development build: **owner** and **member**.

```bash
npm run emulators     # repository root
npm run seed:demo
cd mobile && npm start
```

Signing in as the member shows Rizu Ahmed's two tasks, one of them four days
overdue and three reminders up the ladder. Signing in as the owner shows the
same two tasks from the other side of the board.

## Verified

- An end-to-end test runs **the exact query this screen runs**
  (`where("assigneeUid", "==", uid)`) with real claims: it returns their task
  and not the other one, the episode title comes back as
  `রক্তমুখী নীলা`, marking done is accepted and the admin's board sees it
  closed — while reading the whole collection, reading somebody else's task,
  and writing `remindersSent` are all refused.
- 73 unit tests in `mobile/`, including the member-facing chain sentence with
  channels on, one channel on, and every channel off.
- Both member states static-render.
- The demo sign-in was checked end to end: signing in as `rizu@example.com`
  resolves to uid `seed-rizu`, claims come back `member` / `approved`, and two
  tasks are visible.

Not verified on a device — and this is the screen where that matters most,
because it is the one the team actually holds. The yellow header against the
status bar, and whether a list of overdue cards reads as urgent or as noise,
are judgements a renderer cannot make.
