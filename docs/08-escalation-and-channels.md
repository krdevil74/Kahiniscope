# Step 8 — The escalation engine, push, and the Telegram bot

The app starts sending. Until now the ladder was drawn but never climbed;
from here a task that nobody closes gets chased on its own, every day, until
it is done.

```bash
npm run test:escalation    # the job, run for real against the emulators
```

---

## The job

`escalateDaily` runs at **09:00 Asia/Dhaka**, every day. One pass:

```
for each task where done == false:
    decide(task, plan, now, quietHours)
    if send:
        chain: push → telegram → whatsapp → sms   (stop at the first success)
        log every attempt
        remindersSent += 1, lastReminderAt = now
```

The decision is in `functions/src/escalation/decide.ts`, with no Firebase in
it, so it can be tested directly rather than inferred from what the job
happened to send. Four things it gets right that are easy to get wrong:

- **Everything is in Dhaka time.** `daysBetween` counts Bangladeshi calendar
  days, not UTC ones and not 24-hour blocks. A reminder sent at 23:30 last
  night and one due at 09:00 this morning are a day apart even though only
  nine hours have passed — and 20:00 UTC is already tomorrow in Dhaka.
- **The job is safe to run twice.** The guard is "has a reminder gone out
  today, in Dhaka" — which also covers an admin who tapped Nudge at eight in
  the morning, so nobody is chased twice in one day by two different routes.
- **The step index is capped**, so after the fifth reminder the gap stays at
  one day forever.
- **Every refusal is named** — `not-due`, `already-sent-today`, `quiet-hours`,
  `never-started`, `assignee-not-approved` — and counted into the run summary,
  because "why did nobody get a reminder this morning" is the question this job
  will be asked.

The gaps come from `settings/global.plan` on every pass. Shorten the ladder on
the Notify screen and the next morning's run chases sooner; there is no
deploy in between.

### Running it by hand

Waiting until nine tomorrow morning to find out whether the ladder works is not
a reasonable way to test it, so `runEscalationNow` is the same pass behind a
shared secret:

```bash
firebase functions:secrets:set ESCALATION_RUN_KEY
curl -X POST "$FUNCTION_URL" -H "x-run-key: <key>"
```

Every guard inside the pass still applies, so running it twice sends nothing
twice.

## The chain

`push → telegram → whatsapp → sms`, stop at the first success, **log every
attempt**. The adapters are injected rather than imported, so the order, the
skips and the logging are tested with fakes — no network, no bot token, no
device.

- **Push** prunes its own dead tokens. A token that comes back
  `not-registered` is removed from the user record then and there; that is the
  only moment we can know, and leaving it means failing every morning.
- **Telegram** carries an inline **✓ Mark done** button. Tapping it closes the
  task from the chat — no app, no sign-in. The handoff calls this the
  highest-value extra and it is: the entire point of the ladder is to stop
  chasing people, and a one-tap reply in a chat they are already reading is
  the shortest path to done.
- **WhatsApp and SMS** are in the chain but report themselves unconfigured
  until step 9. The chain treats that as "skip and try the next", not as a
  failure.
- **SMS is held back** until a task reaches the daily stage. The free Textbelt
  key allows one message a day, and spending it on a task that is two days
  late wastes it on the wrong task.

A task's `preferredChannel` is tried first and then the normal order resumes —
a preference, not a restriction, because a reminder that is not delivered is
worse than one delivered the wrong way.

**The task's step moves whether or not anything was delivered.** A person who
cannot be reached at all is a fact about the day; leaving them on step 0 would
mean retrying the same dead channel at the same cadence forever, and the
reminder log is where that shows up.

## Telegram, end to end

1. `@BotFather` → `/newbot` → keep the token.
2. `firebase functions:secrets:set TELEGRAM_BOT_TOKEN`
3. `firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET` — any long random
   string.
4. Put `TELEGRAM_BOT_USERNAME=YourBotName` in `functions/.env`.
5. Deploy, then point Telegram at the webhook:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<region>-<project>.cloudfunctions.net/telegramWebhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

A member then taps **Connect Telegram** on their dashboard, which mints a
one-time token, opens `t.me/<bot>?start=<token>`, and the webhook writes their
`chat_id` back. The token is single use.

The webhook is public by nature, so: the secret header is checked on every
update, and a **Mark done** tap is only honoured when the task belongs to the
account that chat is linked to. The chat *is* the credential there — there is
no ID token in a Telegram tap — so that check is the whole of the
authorisation.

It always answers 200. A non-200 makes Telegram retry the same update forever.

## Two debts paid

- **The welcome message.** The holding screen has promised since step 4 that
  "we will message you the moment it is approved". `welcomeOnApproval` fires on
  the crossing from pending to approved and sends it. Revoke-then-approve sends
  again, which is right: they were told they were out.
- **Nudge actually sends.** The board's buttons used to move the ladder and
  show a toast naming a channel nothing had been sent on. They are Cloud
  Functions now, and the toast names the channel that really worked — or says
  plainly that nobody could be reached.

## Push registration

`registerForPush` runs once per approved session, from the session provider
rather than from whichever screen happened to be built first. It asks for
permission, creates the `reminders` notification channel (the same id the
sender targets), and adds the device's FCM token to `users/{uid}.fcmTokens`.

It needs a development or production build — Expo Go has no FCM credentials —
and does nothing, quietly, when it cannot work. A member who refuses
notifications still gets Telegram, WhatsApp and SMS.

## Verified

**9 end-to-end tests** against the emulators, driving the real HTTP endpoint
with tasks whose `assignedAt` has been wound back by hand — which is how the
handoff asks for this to be tested:

- a task backdated eight days is chased; one backdated three is not;
- running the pass twice in one day sends nothing twice, and `remindersSent`
  stays at 1;
- each rung is respected — at step 1 three days is not enough and four is; at
  step 9 it is daily;
- a task marked done is not even considered;
- somebody whose access was revoked mid-episode is not chased;
- quiet hours hold a due reminder and the next pass outside the window sends
  it;
- shortening the plan in `settings/global` makes the next pass chase sooner;
- the run endpoint refuses anyone without the key;
- **every attempt is written to `reminderLog`** — push first, then Telegram,
  each with the reason it failed. Nothing can actually deliver in an emulator,
  which makes this a good test of the part that matters most.

Plus **48 unit tests** in `functions/`: the Dhaka clock, the ladder, the quiet
window wrapping midnight, the chain's ordering and fallback, the SMS
hold-back, an adapter that throws, and the message copy including the Bengali
titles and the digest.

Not verified: no message has actually been delivered to a real device or a
real chat. That needs the bot token, a deployed webhook and a development
build — the first real test of step 8 is a phone buzzing.
