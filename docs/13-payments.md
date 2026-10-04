# Submitting, reviewing, and getting paid

Work used to be a bit: done or not, decided by whoever did it. That was fine
while nobody was being paid for it. This is what replaced it, and why.

---

## The lifecycle

```
open ──── member: Submit for review ────► submitted
 ▲   └──── admin: tick, somebody else's ───┘  │
 │                                            ├─ admin: Approve ──► approved ──► paid
 └──────── admin: Send back + reason ─────────┘         (payment opens)   (money out)
 │                                                           ▲
 └──────── admin: tick, their own work ──────────────────────┘
```

Four states, one of which does double duty:

| | What it means | Who moves it | Reminders |
| --- | --- | --- | --- |
| `open` | Nobody has handed anything in | — | Climb the ladder: 7, 4, 3, 2, 1 days |
| `submitted` | Handed in, waiting on an admin | member, or an admin ticking it in | **Stop** |
| `approved` | Accepted; a payment is open | admin | none |
| `paid` | The money has gone out | admin | none |

**Rejection is not a state.** Sending work back puts the task at `open` again —
it is work somebody still owes — and leaves `rejectedAt` and `rejectionNote`
behind. That pair is what the escalation engine reads to chase it **every
other day** instead of climbing the ladder, and the reason travels with every
reminder.

Two details that are easy to get wrong:

- **Reminders stop the moment work is submitted.** A member who has done the
  job and is waiting on a review is not the person who is late. Chasing them
  would be chasing the wrong person.
- **`done` still exists**, written alongside the status and meaning exactly
  what it always meant: accepted. Every percentage on every screen, and the
  escalation job's own query, were built on it. A task written before any of
  this existed has only `done`, and reads correctly as `approved`.

### The admin's own work, and the tick on the episode screen

An admin can be assigned work like anybody else — and they have no **Submit for
review** button, because `/my-tasks` sends an admin to the board. The only
affordance their own task has is the box beside it on the episode screen.

That box used to write `done` straight onto the task. It predates payments and
never learned about them, so closing a task that way accepted work and opened
**no payment** — money quietly not owed to anybody, on a task that could not
then be rescued either: the member-submit rule requires `done == false`, and
`reviewTask` only ever accepted `submitted`. It is now the one thing it can
honestly be — a decision — and which decision depends on whose work it is:

| Whose task | What the tick does | Why |
| --- | --- | --- |
| The admin's own | **Approved on the spot**, payment opened | Nobody to hand it to, and no Submit button to hand it in with |
| Anybody else's | **Sent to review** (`submitted`) | The form that prices work lives in Review; reminders stop either way, which is what the tick was for |
| Already in | Nothing — the box is locked | There is no un-opening a payment |

So `submitted` is no longer only a member's doing, and `approved` is no longer
only reached from `submitted`: an admin's own task goes `open → approved` in one
step. `reviewTask` allows that single exception, guarded on `done` rather than
`status` so a task closed by an older build can never be paid for twice. Nothing
else changed — the same transaction, the same rate snapshot, the same advance
settlement. **Sending work back still needs a submission**: there is nothing to
reject about work nobody has offered, and an admin does not chase themselves.

One honest gap: the episode screen has nowhere to ask for the minutes, so a
recording of the admin's own is approved with the rate snapshotted but **no
estimate**. It lands in the Payments queue with an empty amount field, which is
where the real figure is typed for every payment anyway. A cover, which is one
unit by definition, comes out priced. The admin is not notified — they are the
person who just pressed the button.

### Why alternate days for a rejection

The ladder exists to get work in **by a due date**. Once work has been handed
in and sent back, that date is long past and there is nothing left to escalate
towards. What is wanted then is a steady, undramatic tap on the shoulder until
it comes back. `REJECTED_GAP_DAYS = 2`, in both
`mobile/src/lib/review.ts` and `functions/src/escalation/decide.ts` — the same
two-implementations rule the ladder itself follows.

---

## Money

### Rates are per person, not per craft

Two voice artists on the same episode are not on the same rate. That is the
whole reason a rate card lives on the user record rather than in a price list.
Set it on the person's page; edit it whenever.

| Rate | Unit |
| --- | --- |
| Voice · character | per minute |
| Voice · narration | per minute |
| Sound design | per minute |
| Cover design | per cover |

**Voice work carries two rates.** The same artist is worth a different figure
reading narration and performing a character, and nothing in the task itself
reveals which it was — so the admin says which at the moment of approval.

**A blank is not zero.** It means there is no rate for that kind of work, and
the admin types a figure at approval instead. Script writing, translation,
editing, SEO, music and proofreading are all paid that way by design: a price
list that pretended to cover them would be a price list nobody trusted.

### What is asked for at approval

Decided by the work, not by a form that asks everything:

- **Minutes** — voice and sound design. Required: without them there is no
  figure to put in front of anybody.
- **Word count** — script writing. Context for the admin, *not* a multiplier.
- **Amount** — wherever there is no rate to multiply.
- **Comment** — always optional, always carried onto the payment.

### Estimate, then figure

Approving opens a `payments` record with the rate **snapshotted**. Raising
somebody's rate next month must not quietly restate what last month's approved
work was worth.

The member sees the estimate immediately, under a disclaimer that says plainly
whose decision the real figure is. The admin sets the actual amount when they
pay, and it is allowed to differ — that is the point of the disclaimer, not a
loophole in it.

> This is an estimate from your rate. The final amount is set by the admin and
> can differ depending on what the work needed.

**Paid and pending are never added together** anywhere in the app. One is
money that exists; the other is arithmetic.

---

## Advances

An artist about to record twelve episodes may want money now, and that money
cannot be attached to a task because none of the tasks exist yet. So it sits
on their record as a **balance**, and approving their work spends it.

```
admin: Pay advance ₹5,000  ──►  balance ₹5,000
                                    │
approve 5 min @ ₹80  ──► ₹400 ──────┤  paid on the spot, no queue entry
                                    ▼
                                balance ₹4,600
```

- **Settlement is all or nothing.** If the balance covers the approved amount,
  the payment is created already `paid`, the task goes straight to `paid`, and
  the balance drops. If it does not cover it, the balance is left alone and
  the payment queues as normal. Splitting one approval across an advance and a
  later transfer would leave a payment record carrying two amounts and two
  dates, and nobody reading it a month later could say what was handed over.
- **Work with no figure behind it cannot be settled.** No rate and no typed
  amount means there is nothing to spend.
- **The balance is server-owned.** It is not in any rule a client can satisfy
   — not even an admin's. It moves only through `addAdvance` or through an
  approval, and both are Firestore transactions, because the balance is
  exactly the field two admins could race on: both read ₹600 left, both settle
  ₹600 of work, and the artist has been paid twice out of money that existed
  once.
- **Every advance is its own document** in `advances`. "Where did this balance
  come from" is a question somebody will ask, and a bare total cannot answer
  it.

The admin pays one from the person's page, beside the rate card — the two are
one conversation. The review screen says, *before* the button is pressed,
whether approving will come off an advance and what it will leave.

---

## Notifications

Every one of these is an admin doing something to somebody who is not watching
the app. A change they discover the next time they happen to open it is a
change that may as well not have happened for a week.

| What happened | What they get |
| --- | --- |
| Work approved | "Voice recording approved" — with the pending figure and the disclaimer, or with what came off the advance and what is left |
| Work sent back | "Voice recording needs another look" — carrying the admin's reason |
| Payment made | "₹550 paid" |
| Advance paid | "₹5,000 advanced" — with the new balance |

They ride the same chain as a reminder: push first, then whatever else is
switched on and can reach them. **A notification never fails the thing that
caused it** — the send is wrapped and swallowed, because the money is the
important part and the message is the courtesy.

---

## The Payments tab

**An admin** sees two panels, and the screen loads nothing it was not asked for.

**Payment pending** leads: the number of payments waiting, the estimated total,
and nothing else until it is tapped. Open it and the queue unfolds one card at a
time, oldest first — each with the working shown (`12 min × ₹50`) and an amount
field pre-filled with the estimate, a field rather than a label because the admin
decides. Marking one paid closes it, moves the task to `paid`, and takes it out
of this panel for good.

**Paid month by month** is under it: twelve bars, a year of payments at a glance,
with a year filter above them. Tap a bar and that month's payments list
underneath — the same row a member reads on their own screen with the name and
avatar added, so the episode, the minutes, the rate and what was actually paid
against the estimate are one tap further. Tap the bar again to close it.

### Why it is built this way

The old version subscribed to the whole `payments` collection and added it up on
the phone. That is fine in the first month and worse every month after: opening
the tab cost the entire payment history of the operation, for ever, to show a
queue of four and a list of twenty. **Nothing on this screen scales with history
any more.** Three bounded questions replaced it:

| The panel asks | The query | What it costs |
| --- | --- | --- |
| what is owed now | `where status == pending`, live | the work in flight, not the archive |
| what went out each month | one aggregation per bar: `sum(finalAmount)`, `count()` | two numbers a month, whatever the volume |
| what made up this month | `where status == paid` + a `paidAt` range, on demand | only the month somebody opened |

The bars are aggregation queries on purpose. Firestore adds up in the index and
returns a sum and a count, so a bar costs the same whether the month holds four
payments or four thousand — and no payment document is transferred to draw the
chart at all. The month list is a one-shot read rather than a listener, because a
month that has closed cannot change; only the pending queue stays live, since two
admins working the same queue is the one place staleness would cost money.

Both need a composite index on `payments` — `status` ascending, `paidAt`
ascending — which is in `firestore.indexes.json`. One index serves the sums, the
month listing and the `orderBy` in both directions.

The year filter's range comes from a single document read: the oldest paid
payment, ordered by date, limit one. A filter should not have to load a
collection to know which years to offer.

Months are the device's own months, not UTC. Whoever reads this is looking at a
calendar on a wall in Dhaka, and a boundary drawn in UTC would put the evening of
the 31st in the wrong bar. Ranges are half-open (`>= start`, `< end`), so no
payment lands in two months and none lands in neither.

### When the bars will not add up

Twelve bars were twelve aggregations opened at once, gathered with
`Promise.all`, and a single rejection among them threw all twelve away. The
screen then had an empty array and one word for it: **"No payments yet"** —
said to an operation that had paid six people that week. The figures were in
Firestore the whole time, the index was deployed, the rules allowed it; the
chart simply could not say the difference between *nothing was paid* and *I
could not ask*.

So the months are asked four at a time, each retried once, and behind them sit
two more rungs:

| What happened | What the screen does |
| --- | --- |
| every month answered | the bars, as before — nothing is read, nothing is transferred |
| the aggregations will not answer | one capped read of the window (`WINDOW_READ_LIMIT`, 500, newest first), bucketed by month on the phone, and a line under the heading saying so |
| that fails too | the error is said out loud, with **Try again** — never an empty month |

The fallback is a ceiling rather than a page, because the alternative is the
thing this screen exists to avoid: reading the collection to draw a chart. 500
documents is a bounded cost, and when the cap is reached the screen says the
oldest months in view may be short rather than quietly drawing a short bar.
Ordered newest first, so what a cap drops is the far end of the window and not
an arbitrary handful.

The same rule covers the month list and the screen's own empty state: a month
that could not be read says *could not be read*, and **"No payments yet"**
appears only when the screen actually knows it. An error is not an empty
operation.

**A member** sees their **available balance** first, if they have one — it is
the question somebody opens this screen to answer — then two figures kept
apart: paid all time, and approved-but-not-yet-paid as an estimate, with the
disclaimer. Below them, every task with its amount, and whether it was paid
from the advance. A member with no app never sees any of this; their payments are the
admin's record of what is owed.

If a pending entry has no rate behind it, the member's pending total shows
`₹1,200+` rather than pretending to be complete, and says why.

---

## The screenshot that proves it

Added 30 September. An admin pays by transfer, screenshots the confirmation, and
the artist can save that image against the payment — a small ⤓ beside the amount
on their own Payments screen.

**The bytes are not on the payment record**, and that is the whole design. A
payment is read constantly: every total on both sides of the app loads these
documents, and a few hundred kilobytes of base64 in one would be paid for on
every one of those reads, for a year, long after anybody cared to look at the
image. So:

| | Where | Kept | Read when |
| --- | --- | --- | --- |
| The payment | `payments/{id}` | a year, with everything else | always |
| The screenshot | `paymentProofs/{paymentId}` | **30 days** | somebody taps download |

The payment keeps two small dates instead — `proofAttachedAt` and
`proofExpiresAt` — and those are all any screen needs to decide whether to offer
the download. Two dates rather than one flag, because "there was a screenshot and
it has expired" is a different sentence from saying nothing, and a member who saw
the image last month should read the first one.

### Deleting only the image

The proof document is keyed by the payment id, so deleting it is a one-document
delete that leaves the amount, the date and the working untouched. That is the
reason for a separate collection rather than a field on the payment: clearing one
field out of a document a month later is a read, a write and a migration nobody
wants to run.

`purgeExpiredProofs` (`functions/src/payment-proof.ts`) runs **daily at 03:30
Dhaka** and deletes everything past its `expiresAt` — daily rather than weekly,
because "a month" should not mean thirty-seven days. It deliberately does **not**
write to the payment: an expiry in the past is already what both sides read as
"gone", and clearing the field would cost a write to say the same thing.

A native Firestore TTL policy on `paymentProofs.expiresAt` would do the same
work, and the two are compatible — whichever runs first wins. It is not the
mechanism here because a TTL policy is configured against the project with
gcloud, so it cannot be declared in this repository, there would be nothing to
test, and it would be a step somebody has to remember on a new project.

### What the limits are, and why

`attachPaymentProof` is a callable, like every other write near money, and for
one extra reason: **the expiry is set from the server's clock.** A phone with the
wrong date would otherwise decide for itself when the evidence disappears, and
this codebase has already been bitten by a device clock once, on the reminder
ladder.

- A Firestore document cannot exceed **1 MiB**, and base64 is a third larger
  than the bytes it encodes, so the payload cap is **700,000 characters** —
  about a 500 KB image.
- The app does not hope to fit that. It resizes to a longest edge of **1280** and
  re-encodes as **JPEG at 60%** before measuring, which puts a UPI confirmation
  around 100–200 KB. Large flat text on a plain ground survives that easily.
- Anything else — a `data:` prefix left on, a PDF, something over the cap — is
  refused by the callable with a sentence the admin can act on, rather than
  failing on the way into Firestore.
- Replacing a screenshot overwrites it and restarts the thirty days. One
  screenshot per payment, the way there is one amount. No history.

### Where the controls are

- **Attach** is on the pending card, where the admin is already typing the figure
  they just transferred. It does not block **Mark paid** in either direction — an
  evidence step that holds up the money is an evidence step people work around —
  and it is also inside an expanded paid row, for when somebody records the
  payment and remembers the screenshot afterwards.
- **Download** is the ⤓ beside the amount, for whoever can read the payment. It
  writes the file and hands it to the share sheet, which is what "download" means
  on Android: Save to Files, Save to Photos, or send it on. That also avoids
  asking for the media-library permission, which is a lot to ask for one image.

### The episode on a payment row

`payments.episodeId` is a plain id string, and is read with the same
two-shape reader the task converter uses (`toId` in `src/lib/convert.ts`).

Both halves of that sentence are load-bearing, and they are there because of a
bug. A task's `episodeId` is a **DocumentReference** — the data model says so
and the Assign form writes one — and `reviewTask` copied the field onto the
payment whole. Both sides of the app look the episode up by id, so every
payment row on a member's screen read **"No episode"**, which is the title of
the episode they had just been paid for. The admin's card showed a blank code
for the same reason.

`reviewTask` now writes `episodeIdOf(data.episodeId)` — the helper already in
`functions/src/episode-roster.ts`, which exists for exactly this two-shape
field — and `toPayment` reads either shape, so payments approved before the fix
keep working without a migration.

---

## Who can do what

| | Member | Admin |
| --- | --- | --- |
| Submit their own task | ✅ | ✅ — and it is accepted in the same step |
| Accept, reject, price work | ❌ | ✅ |
| Read their own payments | ✅ | ✅ (everyone's) |
| Write a payment | ❌ | ❌ — Cloud Functions only |
| Set a rate card | ❌ | ✅ |
| Pay an advance | ❌ | ✅ |
| Change a balance | ❌ | ❌ — Cloud Functions only |
| Attach a payment screenshot | ❌ | ✅ — through a callable |
| Read a payment screenshot | ✅ (their own) | ✅ (everyone's) |

Submitting is a direct Firestore write, because the rules can express exactly
that transition and a round trip would make the one button a member has feel
dead. Everything after it is a callable: accepting work opens a payment
record, and a payment record a client could write would not be a payment
record. The amount is the whole point of the document, so **nobody** writes
`payments` from a client — not even an admin.

The guard against re-submitting accepted work is `done`, not `status`: tasks
written before this existed carry only `done`, and a closed one must not be
reopenable.

---

## Verified

- **13 unit tests** on the arithmetic, in the app and again on the server —
  two implementations, the same examples, exactly as the escalation ladder
  already works. Rounding, missing halves, negative nonsense, and the rule
  that zero is not a rate.
- **10 unit tests** on the lifecycle: what is chased, what is not, and the
  two-day gap surviving a reminder count that would have narrowed the ladder
  to one day.
- **9 emulator tests** end to end: a member handing work in and being unable
  to accept it by either route; a rejection carrying its reason and restarting
  the clock; the rate snapshot surviving a rate rise; narration priced
  differently from character; a typed figure where there is no rate; paying an
  amount that differs from the estimate; and a member reading their own
  payments and nobody else's.
- **20 emulator tests** in all, including the advance path: money advanced
  and recorded, an approval coming straight off the balance and being paid on
  the spot, a balance too small being left alone rather than part-spent, and
  work with no figure behind it spending nothing.
- **5 of those 20** on the admin's own work: accepted without being handed in
  and still opening a payment at their own rate; a recording of theirs opening
  a payment with no estimate rather than no payment; the same task refusing a
  second approval, so one job cannot become two payments; a task closed by an
  older build refusing it too; and a rejection still requiring a submission.
- **4 unit tests** on which of the three things the tick does, including that
  an unread session is nobody's own work — `"" === ""` is the one comparison
  that would hand somebody else's task an approval.
- **21 unit tests** on the month arithmetic behind the chart: the rolling window
  crossing a new year, a calendar year that never runs into the future, half-open
  month ranges, bars scaled against the tallest month, a ₹50 month staying
  visible beside a ₹50,000 one, and an empty month drawing a stub rather than
  nothing. Six of them are the fallback: payments bucketed into the month they
  were paid in and no other, every month asked for coming back so the chart
  draws the same columns either way, a payment with no `paidAt` counted in no
  month, and a failure that reads as a failure rather than as a figure of zero.
- **6 emulator tests** on what the screen actually asks Firestore for: that a
  bar is a sum and a count rather than a download, that the month before does not
  pick up this month's work, that opening one month returns only that month, that
  paying something takes it out of the pending query for good, that the capped
  read behind the bars adds up to exactly what the index totalled, and that a
  member cannot run the admin's totals across everybody — the aggregation obeys
  the same rules as the documents.
- **9 unit tests and 6 more on the server** on the screenshot: what the row says
  in each of its three states, that expiry is judged by the date rather than by
  the sweep having run, the payload cap, the file name a download lands in, the
  base64 check that stops a `data:` prefix reaching a document, and that a
  nonsense retention never means no retention.
- **6 emulator tests** on the screenshot end to end: it lands in its own
  collection with none of the bytes on the payment; replacing it restarts the
  thirty days; a member can read their own and neither write one nor attach one;
  junk and oversize payloads are refused with a sentence; and **the sweep deletes
  the image and leaves the payment alone** — run with a clock a month ahead,
  which is the only honest way to test a deletion job.
- **11 rules tests** on who may write what, including that the balance is
  beyond an admin's reach as well as a member's.
