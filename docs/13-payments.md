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

**An admin** sees a queue: everything approved and unpaid, oldest first, each
with the working shown (`12 min × ₹50`) and an amount field pre-filled with the
estimate — a field rather than a label, because the admin decides. Marking one
paid closes it and moves the task to `paid`.

**A member** sees their **available balance** first, if they have one — it is
the question somebody opens this screen to answer — then two figures kept
apart: paid all time, and approved-but-not-yet-paid as an estimate, with the
disclaimer. Below them, every task with its amount, and whether it was paid
from the advance. A member with no app never sees any of this; their payments are the
admin's record of what is owed.

If a pending entry has no rate behind it, the member's pending total shows
`₹1,200+` rather than pretending to be complete, and says why.

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
- **11 rules tests** on who may write what, including that the balance is
  beyond an admin's reach as well as a member's.
