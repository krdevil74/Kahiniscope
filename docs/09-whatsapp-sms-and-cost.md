# Step 9 — WhatsApp, SMS, and what this actually costs

Both paid channels are built. Both ship **switched off**, because the app is
meant to run at zero cost and neither of them does.

---

## What each channel costs

| Channel | Cost | Cap | Ships |
| --- | --- | --- | --- |
| **Push (FCM)** | Free | None | **On** |
| **Telegram** | Free | None | **On** |
| **WhatsApp Cloud API** | **Billed per message** | — | Off |
| **Textbelt SMS** | Free key: **1 SMS/day for the whole key** | 1/day | Off |
| Firestore | Free tier: 50k reads, 20k writes a day | — | — |
| Cloud Functions | Free tier: 2M invocations a month | — | — |

A daily job over a dozen tasks is roughly **30 function invocations a month**
against a two-million allowance, and a few hundred Firestore reads a day
against fifty thousand. The Blaze plan is required — scheduled functions need
it — so a card has to be on file, but nothing on it should ever be charged.
**Set a budget alert at a dollar or two anyway**; that is what turns "should"
into "will know if not".

With push and Telegram alone, every member is reachable for nothing: push
while the app is installed, Telegram the moment they press Start once. That is
the configuration the app ships in, and it is the one I would leave it in.

### On WhatsApp specifically

The design's "1,000 free service conversations / month" is Meta's older
pricing model. Business-initiated template messages — which is exactly what a
reminder is — are billed per message now, and Meta has changed these terms
repeatedly. The Notify screen says so, in the same red the rest of the app
uses for things going wrong, rather than repeating a number that may no longer
be true. **Check the current Bangladesh utility rate before switching it on.**

The setup is also the slowest part of the whole project: a Meta developer app,
a registered and verified number, a permanent system-user token, and a
template submitted for review. Days, not hours.

### On SMS

Textbelt's free key sends **one message a day across the entire key** — not
one per member. It is a demo. The chain holds SMS back until a task has
reached the daily stage, so if it is on, the day's single message is spent on
the task that is furthest gone rather than the first one the loop happened to
reach.

If SMS genuinely matters, a local Bangladeshi gateway bought in bulk will cost
less and deliver better than any international free tier. `sendSms` in
`functions/src/messaging/sms.ts` is the one function that would need
replacing.

## What was built

**`whatsapp.ts`** sends the approved template with three positional
parameters, matching the body the handoff proposes:

```
Reminder: {{1}} for {{2}} is {{3}} days overdue.
```

Meta rejects a template message whose parameter count does not match the
approved body, so that list is built in one place and unit tested. The number
is stripped to digits, which is what the Graph API wants, and a task that is
not actually late sends `0` rather than a negative.

**`sms.ts`** trims to 160 characters with an ellipsis rather than a cut word,
and logs a warning when Textbelt reports the day's quota nearly spent —
before the morning it silently stops.

Neither will attempt a send without credentials: they report themselves
**skipped**, which the chain treats as "try the next one", not as a failure.

## The three confirmations

**Notifications pop up on the device.** Android shows a pushed notification by
itself when the app is backgrounded or closed. In the foreground it does not —
the app is asked to decide — so `installNotificationHandler` says show it
anyway, with sound and a banner. A reminder that is silent because the person
had the app open is a reminder that did not work.

Tapping one lands somewhere useful: a member goes to their task list, where
the Mark done button is; an admin goes to the person who owes the work. Both
are one screen from doing something about it, which is the only reason to tap
a reminder.

**The admin chooses the channel per person.** `users/{uid}.preferredChannel`,
set from a picker on person detail: *Whatever works*, Push, Telegram, WhatsApp,
SMS. A channel that is switched off, or that this person has no address for,
is shown struck through rather than hidden — that is information, not clutter.
It is why they are not getting WhatsApp.

It is a **preference, not a restriction**. The pinned channel is tried first
and the chain still falls through if it fails, because a reminder that is not
delivered is worse than one delivered the wrong way. A channel pinned to a
single task, from the Assign form, beats the person-level one.

The security rules allow an admin exactly two fields on somebody else's
record: `status` and `preferredChannel`. A member cannot set their own.

**Zero cost is the default**, and it is now pinned by a test: the shipped
settings have push and Telegram on, WhatsApp and SMS off.

## Switching WhatsApp on, if you decide to

1. Meta developer app → add the WhatsApp product → register and verify a
   number → permanent system-user token.
2. Submit the template. Name it `task_overdue`, or set
   `WHATSAPP_TEMPLATE_NAME` in `functions/.env`.
3. `firebase functions:secrets:set WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID`.
4. Deploy, then switch WhatsApp on from the Notify screen — owner only.

SMS is the same, with `TEXTBELT_KEY`.

## Verified

**11 new unit tests** on the two adapters: the template's parameter count and
order, a digest that has no single task to name, a negative overdue count, the
digits-only number, the SMS length cap and its ellipsis, and — for both —
that an unconfigured adapter reports *skipped* rather than trying.

**2 new rules tests**: an admin can set `status` and `preferredChannel` and
nothing else on somebody else's record, an invalid channel value is refused,
and a member cannot pin their own.

**4 existing channel tests were rewritten** rather than patched: they assumed
WhatsApp was on by default, and it no longer is. The new default is now
asserted directly, so switching a paid channel on becomes a deliberate,
visible change rather than something that drifts back in.

Not verified: no WhatsApp template has been approved and no SMS has been sent,
because both need accounts and money that this project has deliberately not
spent.
