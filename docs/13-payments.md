# Submitting, reviewing, and getting paid

Work used to be a bit: done or not, decided by whoever did it. That was fine
while nobody was being paid for it. This is what replaced it, and why.

---

## The lifecycle

```
open ──── member: Submit for review ────► submitted
 ▲                                            │
 │                                            ├─ admin: Approve ──► approved ──► paid
 └──────── admin: Send back + reason ─────────┘         (payment opens)   (money out)
```

Four states, one of which does double duty:

| | What it means | Who moves it | Reminders |
| --- | --- | --- | --- |
| `open` | Nobody has handed anything in | — | Climb the ladder: 7, 4, 3, 2, 1 days |
| `submitted` | Handed in, waiting on an admin | member | **Stop** |
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

## The Payments tab

**An admin** sees a queue: everything approved and unpaid, oldest first, each
with the working shown (`12 min × ₹50`) and an amount field pre-filled with the
estimate — a field rather than a label, because the admin decides. Marking one
paid closes it and moves the task to `paid`.

**A member** sees two figures kept apart: paid all time, and approved-but-not-
yet-paid as an estimate, with the disclaimer. Below them, every task with its
amount. A member with no app never sees any of this; their payments are the
admin's record of what is owed.

If a pending entry has no rate behind it, the member's pending total shows
`₹1,200+` rather than pretending to be complete, and says why.

---

## Who can do what

| | Member | Admin |
| --- | --- | --- |
| Submit their own task | ✅ | ✅ |
| Accept, reject, price work | ❌ | ✅ |
| Read their own payments | ✅ | ✅ (everyone's) |
| Write a payment | ❌ | ❌ — Cloud Functions only |
| Set a rate card | ❌ | ✅ |

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
- **8 rules tests** on who may write what.
