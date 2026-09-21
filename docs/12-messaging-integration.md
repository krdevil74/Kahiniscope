# Integrating WhatsApp and Telegram

A single document for getting reminders out of Firebase and onto somebody's
phone over a messenger rather than a push notification. `docs/08` describes
how the escalation engine decides *when* to send and `docs/09` weighs what
each channel *costs*; this one is the wiring, end to end, for the two channels
that matter once people who have never installed the app are on the team.

Both channels ship built and switched off. Turning either on is configuration,
not code.

---

## Why these two

Push only reaches somebody who has installed the app, signed in, been
approved, and granted the notification permission. An admin can now add people
who will never do any of that — they exist as a name and a phone number (see
**Contacts**, below) — and for them push is not a fallback that failed, it is
a channel that cannot exist.

That leaves the chain's middle two rungs doing the real work:

| | Reaches | Needs from them | Cost |
| --- | --- | --- | --- |
| **Telegram** | anyone who opens the bot once | one tap on an invite link | nothing, unlimited |
| **WhatsApp** | anyone with the number | nothing at all | per message, billed |

Telegram is free and two-way — a reminder carries a **Mark done** button that
closes the task from the chat, so the app never has to be opened. It costs one
tap of setup from each person. WhatsApp needs nothing from them, which is
exactly why it is the channel for somebody who will not cooperate with setup,
and it is the one you pay for.

The sender tries them in order — push → Telegram → WhatsApp → SMS — stopping
at the first that both is switched on and can actually reach the person. An
admin can pin a preference per person or per task; the chain still falls
through if the pinned one fails.

---

## Telegram

### What you need first

A Telegram account. That is all — there is no business verification, no
billing, no review.

### 1. Make the bot

Message [@BotFather](https://t.me/BotFather) → `/newbot` → give it a display
name and a username ending in `bot`. Keep the token it gives you; it is the
only copy.

### 2. Put the token where the functions can read it

```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET   # any long random string
```

The webhook secret is yours to invent — `openssl rand -hex 32` is fine. It is
what stops anyone who guesses the function's URL from posting fake updates
into your database.

Then add the bot's username to `functions/.env`:

```
TELEGRAM_BOT_USERNAME=Kahiniscope_bot
```

Without the `@`. This one is not a secret — it appears in every invite link —
which is why it lives in `.env` rather than Secret Manager.

**It has to be set in two places.** `functions/.env` is gitignored, so the
deploy workflow writes its own copy, and it reads a repository **variable**
rather than a secret (`vars.TELEGRAM_BOT_USERNAME` in
`.github/workflows/deploy.yml`) precisely because a bot name is public:

```bash
gh variable set TELEGRAM_BOT_USERNAME --body Kahiniscope_bot
```

Miss that one and a locally-deployed bot works while the deployed one hands
out links to a name that does not exist. `gh secret set` is the wrong command
here and the workflow will not see it.

### 3. Deploy, then point Telegram at the webhook

```bash
npm run deploy:functions

curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://asia-south2-kahiniscope-5c9ee.cloudfunctions.net/telegramWebhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

The deploy is not optional and not the last step: a secret's value reaches the
code only at deploy time, so setting `TELEGRAM_BOT_TOKEN` and then not
redeploying leaves the functions running on whatever version they were built
against — which, the first time, is the placeholder `unset`.

Check it took:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

`pending_update_count` climbing and a `last_error_message` are the two things
worth reading there.

### 4. Connect a person

There are two routes in, and they exist because there are two kinds of person.

**Somebody with the app** taps **Connect Telegram** on their own dashboard.
That calls `linkTelegram`, which mints a one-time token onto their user
record and opens `t.me/Kahiniscope_bot?start=<token>`.

**Somebody without the app** cannot tap anything — they have no dashboard. An
admin opens their person page and taps **Telegram invite**, which calls
`contactTelegramLink` and hands the same kind of link to the OS share sheet,
so it goes out over whatever you already talk to them on. They press **Start**
in Telegram and they are connected.

Either way the webhook matches the token, writes the chat id onto the record,
and burns the token. It is single use: a link that has been used, or has been
superseded by a newer one, is dead.

**An admin cannot type a chat id in.** It does not exist until the person
opens the chat, and Telegram will not reveal it to anybody else. This is the
one thing about Telegram that cannot be arranged on somebody's behalf, and it
is why WhatsApp remains the default for contacts.

### What arrives

A reminder, and an inline **Mark done** button. A tap closes the task and
stops the ladder. The chat is the credential for that — there is no ID token
in a Telegram tap — so the webhook honours it only when the task belongs to
the account that chat is linked to.

### If it goes quiet

| Symptom | Cause |
| --- | --- |
| Bot answers `/start` but reminders never arrive | `telegramChatId` is null on the record — the token was stale. Send a fresh invite. |
| Nothing at all, no error | `TELEGRAM_BOT_TOKEN` is the literal string `unset`; the channel reports itself unconfigured and is skipped silently. |
| `getWebhookInfo` shows 403s | `secret_token` in `setWebhook` does not match `TELEGRAM_WEBHOOK_SECRET`. |
| Telegram retries the same update forever | Something returned a non-200. The webhook always answers 200 by design; a 500 means the function itself crashed before reaching that. |

---

## WhatsApp

### What you need first

Considerably more than Telegram: a Meta developer account, a business, a phone
number that is not already on WhatsApp, and a template approved by Meta before
a single message can go out. Budget days, not minutes — most of the elapsed
time is Meta reviewing things.

**This channel bills per message.** The "1,000 free conversations a month"
figure that circulates is Meta's old pricing model and is not what you will be
charged under. `docs/09` has the arithmetic. Push and Telegram cover everyone
who will cooperate, for nothing, which is why this ships off.

### 1. The Meta side

1. A Meta developer app → add the **WhatsApp** product.
2. Register and verify a phone number. It cannot be a number already in use on
   consumer WhatsApp.
3. Create a **system user** and issue it a permanent token. The temporary
   token the dashboard shows you expires in 24 hours and will strand you.
4. Note the **phone number ID** — the long numeric id, not the phone number.

### 2. The template

Business-initiated messages must be a template approved in advance; you cannot
send free text to somebody who has not messaged you first. The adapter sends
one named `task_overdue` by default — override with `WHATSAPP_TEMPLATE_NAME`
in `functions/.env`.

The parameter count in the template body has to match what the adapter fills
in. Change the template's wording freely, but change the number of `{{n}}`
placeholders and messages start failing with a template-mismatch error that
does not say so plainly. There are unit tests over the parameter count for
exactly this reason.

### 3. Secrets, then on

```bash
firebase functions:secrets:set WHATSAPP_TOKEN
firebase functions:secrets:set WHATSAPP_PHONE_ID
npm run deploy:functions
```

Then switch WhatsApp on from the **Notify** screen — owner only. The switch is
read from `settings/global` by both the app and the scheduled job, so it takes
effect on the next run with no deploy.

### If it goes quiet

| Symptom | Cause |
| --- | --- |
| `canReach` false for everyone | No `phone` on the records, or the token/phone id secrets are unset. |
| 401 from Graph | The temporary token expired. Issue a permanent system-user token. |
| 132000-series error | Template parameter count does not match the template. |
| Delivered but nobody sees it | Sent to a number that is not on WhatsApp. There is no bounce; it simply goes nowhere. |

---

## Contacts: people with no app

An admin adds somebody from **Team → Add someone without the app**: a name, a
phone number, what they do, and which channel to remind them on. They are
assignable immediately and the board counts them like anyone else.

What is different about them:

- **No account exists.** The record is marked `accountless: true` and no
  Firebase Auth user sits behind it, so no claim is ever minted for them and
  nothing can sign in as them.
- **The phone number is the identity.** It is normalised to E.164 on the
  server — never trusted from the client — and must be unique across every
  user record.
- **Push is not on their chain.** There is no device. WhatsApp, Telegram and
  SMS are the three the admin can choose between.
- **Only an admin maintains them.** They have no app in which to maintain
  themselves.

### When they finally install the app

They sign in with Google like anyone else and arrive as an ordinary pending
registration. If the phone number they register with matches a contact, the
approval queue says so — naming the contact and how many open tasks are on it
— and offers **Approve & link** beside the usual **Approve as a new person**.

Linking moves their tasks onto the real account, carries over what the admin
knew about them (crafts, pinned channel, a linked Telegram chat), deletes the
contact record, and approves the account, in one commit.

**This is deliberately a decision and not an automatic merge.** A phone number
typed into a registration form is a claim, not a proof: anyone who knows a
number could otherwise inherit that person's work by typing it. The admin
looking at both records is the check. The server re-verifies that the two
still share a number before it moves anything.

---

## Checking it works

The honest test is a real reminder to a real phone, but the fast ones first:

```bash
npm test                 # repository root — the chain's order and each adapter
```

The adapters are tested for what they would send without sending it: a channel
whose secret is unset reports itself unconfigured and is skipped rather than
throwing, which is the behaviour that makes shipping them switched off safe.

Then, against the real project:

1. Assign yourself a task due tomorrow.
2. **Nudge now** on the person page. The toast names the channel that actually
   delivered — or says plainly that nobody could be reached, which is the
   answer worth having.
3. Read `reminderLog` in Firestore. Every attempt is there with its channel
   and its result, delivered or failed, and the error if it failed.

`escalateDaily` runs at 09:00 Asia/Dhaka. `runEscalationNow` does the same
work on demand, guarded by `ESCALATION_RUN_KEY`, when you do not want to wait
until morning.
