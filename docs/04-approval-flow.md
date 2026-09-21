# Step 4 — Requests and the approval flow

Anyone can install the app from the Play Store and sign in with Google. What
happens next is this step: they land in a queue, see a holding screen, and can
read nothing until an admin lets them in.

```bash
npm run test:approval     # the whole flow, both sides, on the emulators
```

---

## The three doors

| | What it does | Where it runs |
| --- | --- | --- |
| **Approve** | `status: "approved"` | A direct write. The rules let an admin change `status` and nothing else. |
| **Revoke** | `status: "pending"` | A direct write. Not a deletion — the account and its history survive, and one tap lets them back in. |
| **Decline** | deletes the document **and the account** | A Cloud Function. No security rule can delete a Firebase Auth user. |

Approve and revoke are direct writes on purpose: they land in milliseconds and
the member's app reacts on the next snapshot, with no cold start in between.

`declineRegistration` refuses to touch an account that has already been
approved — that is what Revoke is for. Routing both through one call would make
an accidental tap unrecoverable, so the callable checks `status === "pending"`
and returns a message pointing at Revoke instead.

## What the member does first

A Google sign-in gives a name and an address and nothing else. The queue says
"Approve as Voice", not "Approve" — so a new account fills in a short form
before it starts waiting: craft, phone, and a note in their own words. That is
the one write a pending account is allowed to make, and the rules confine it to
those fields: `role` and `status` are untouchable, so nobody approves
themselves.

`app/pending.tsx` is both states, because the transition between them is the
product. When the admin taps Approve, the claim is re-minted, the snapshot on
the member's own user document fires, and the holding screen gives way to their
dashboard — no sign-out, no second visit.

That last part was a promise the app did not keep for a while. The snapshot
fires the instant the admin writes, and the claim is minted by a Firestore
trigger that runs *afterwards* — so the token the app asked for was a moment
too early, and there was no second attempt. A member sat on the holding
screen until they force-quit, at which point signing in minted a correct
token and it looked as though it had always worked. The session provider now
re-checks on a backoff for about half a minute, and the holding screen has a
pull-to-refresh for when that is not enough.

Phone numbers are normalised to E.164 on the way in, because that is what
WhatsApp and the SMS gateway need. Everybody on this team is in India, so the
form shows a fixed `+91` and takes ten digits: `98765 43210`, `09876543210`
and `919876543210` are all the same number. A number already in E.164 is left
exactly as it is whatever the country, because records written before that
rule carry `+880` numbers and re-reading one must not corrupt it.

## The screen

Built to the design: 36px light avatar — they are not on the team yet — name at
14/600, the masked number and how long they have been waiting in monospace, a
Pending badge, the applicant's note in a sunken quote block, then Decline
(outlined, flex 1) beside Approve as {craft} (yellow, flex 2). Below, the
approved accounts with a Revoke on each row.

Two details that are not in the handoff but that the live version needs:

- **A card greys out while its request is in flight**, and a second tap is
  ignored. Approve is a network round trip; without this, an impatient double
  tap fires it twice.
- **The owner's own row has no working Revoke.** Revoking the owner would be
  undone by the claim-sync trigger on the next write anyway — the owner
  invariant is enforced server-side — so the button is disabled rather than
  offering something that silently fails.

## Still to come

The handoff asks that approving also **sends a welcome message on their best
channel**. That needs the channel chain, which is build-order step 8. The
holding screen already promises it ("We will message you on WhatsApp the moment
it is approved"), so it is a real debt, not a nicety — it is the first thing
step 8 should wire up after the escalation job itself.

## Verified

`npm run test:approval` drives the whole flow through the emulators with real
sign-ins and the real callable:

- a registration reaches the queue with the applicant's own note on it, while
  that account is still refused everything else;
- approving unlocks **that same session**, with no sign-out;
- revoking puts them back in the queue and closes the door again, without
  destroying the account;
- declining deletes the document and the account;
- **a member cannot decline anybody** — the callable refuses, and the target is
  still there afterwards;
- **an approved account cannot be declined by a stray tap** — the callable
  points at Revoke instead.

Also: 50 unit tests in `mobile/` (4 new, on phone normalisation), typecheck
clean, and every route still static-renders — `/requests` and `/pending` were
checked that way.

Not verified on a device. The registration form has text inputs and a keyboard,
which is exactly the kind of thing a static render cannot judge.
