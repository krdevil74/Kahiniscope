# Handoff: Kahiniscope Production Task Manager (Android)

## Overview

An internal production-management app for **Kahiniscope**, a Bengali audio-drama / গল্পপাঠ YouTube channel. One admin assigns episode production tasks (script, translation, voice, mixing, editing, graphics, upload/SEO, music, proofreading) to team members. Until a member marks a task done, the app escalates reminders on a fixed ladder: **first after 7 days, then every 4, 3, 2, 1 day, then daily forever**. Reminders go out over push, Telegram, WhatsApp and SMS — whichever succeeds first.

Anyone can install the app from the Play Store and register. Registrations sit in an approval queue and see nothing until the admin approves them.

## About the design files

`design/Kahiniscope Production.dc.html` is a **design reference**, not production code. It is an HTML/React prototype showing intended look and behaviour, with sample data held in component state. Do not port it verbatim. **Recreate these screens in a real Android app with a real backend**, using the stack below (or the existing stack if this is being added to a codebase that already has one).

`design/Build and Ship Guide.dc.html` is a companion document covering stack choices, the escalation function, channel setup and Play Store publishing. Read it — it is the architectural intent in prose.

`design/ios-frame.jsx` and `design/doc-page.js` are only preview scaffolding for the HTML files. Ignore them when implementing.

To view the prototype: open `design/Kahiniscope Production.dc.html` in a browser. Left phone is the admin app, right phone is a team member's app; both share one state, so approving a registration or ticking a task on one updates the other.

## Fidelity

**High fidelity.** Colors, typography, spacing, radii and copy are final. Recreate the UI to match. The prototype is drawn in an iOS device frame purely because that was the available preview shell — **the product is Android**, so use Material-appropriate primitives (elevation, ripple, system back, Android status bar) while keeping the exact colors, type scale and layout below.

---

## Target stack

| Layer | Choice |
| --- | --- |
| App | React Native via Expo (managed workflow, EAS Build) |
| Auth | Firebase Authentication, Google provider only |
| Database | Firestore, region `asia-south2` |
| Server logic | Cloud Functions for Firebase (Node), one scheduled job |
| Push | Firebase Cloud Messaging |
| Messaging | Telegram Bot API, WhatsApp Cloud API, Textbelt SMS |

No custom server. No REST layer — the app talks to Firestore directly, guarded by security rules, and calls Cloud Functions for privileged actions.

---

## Roles and access

Three roles, enforced by Firebase custom claims and Firestore rules. **The UI is not the security boundary.**

- **owner** — exactly one account, bound to the hard-coded address `owner@kahiniscope.example`. Granted automatically on first sign-in if the Google token has that email *and* `email_verified === true`. Can do everything, plus: promote/demote admins, edit the escalation ladder, revoke access.
- **admin** — promoted by the owner. Can approve/decline registrations, create and assign tasks, nudge, mark anything done. Cannot promote, demote, or change the ladder.
- **member** — the default for every new sign-in, initially with `status: "pending"`. Sees only their own tasks, and can write only the `done` field on them.

The owner address must live in a Cloud Function constant, **never in the app bundle**:

```js
const OWNER_EMAIL = "owner@kahiniscope.example";
```

A `beforeSignIn` / `onCreate` auth trigger writes the user document and sets the claim. Every other sign-in is written `status: "pending", role: "member"`.

Caution to surface to the user: if that Gmail account is lost, admin access is lost. Require 2FA on it, and leave room for a second owner address in the same constant.

---

## Data model (Firestore)

```
users/{uid}
  name          string
  email         string
  phone         string            // E.164, e.g. +8801712344192
  telegramChatId string|null      // captured by the bot webhook
  craft         string            // "Script" | "Translation" | "Voice" | "Post / mix" | "Graphics" | "Proofreading" | "Editing"
  status        "pending" | "approved"
  role          "owner" | "admin" | "member"
  fcmTokens     string[]
  note          string|null       // free text the applicant typed at registration
  createdAt     timestamp

episodes/{id}
  code          string            // "EP-41"
  title         string            // Bengali title, e.g. "রক্তমুখী নীলা"
  airDate       timestamp
  status        "production" | "released"

tasks/{id}
  episodeId     ref
  assigneeUid   string
  type          string            // one of the nine task types
  dueDate       timestamp
  done          boolean
  doneAt        timestamp|null
  remindersSent number            // 0-based escalation step
  lastReminderAt timestamp|null
  assignedAt    timestamp
  preferredChannel "push"|"telegram"|"whatsapp"|"sms"|null

reminderLog/{id}
  taskId        ref
  uid           string
  channel       string
  sentAt        timestamp
  result        "delivered" | "failed"
  error         string|null

settings/global
  plan          number[]          // [7, 4, 3, 2, 1] — editable by owner only
  quietHours    { enabled: boolean, from: 22, to: 8, sendQueuedAt: 9 }
  channels      { push: bool, telegram: bool, whatsapp: bool, sms: bool, email: bool }
```

**Completion percentages are never stored.** Compute at read time: episode % = done tasks / total tasks for that episode; slate % = done / total across all episodes; per-member % within an episode = their done / their total.

### Security rules (behaviour to implement)

- `status == "pending"` → read nothing, write nothing.
- member → read `tasks` where `assigneeUid == request.auth.uid`; update only the `done` and `doneAt` fields on those; read `episodes`; read own `users` doc.
- admin → read/write `tasks`, `episodes`, `users.status`; read `reminderLog`.
- owner → everything, including `users.role` and `settings/global`.
- `reminderLog` is written by Cloud Functions only; clients read, never write.

---

## The escalation engine

One scheduled Cloud Function, daily at **09:00 Asia/Dhaka**.

```
GAPS = settings.global.plan     // [7, 4, 3, 2, 1], then repeat the last value

for each task where done == false:
    step  = min(task.remindersSent, GAPS.length - 1)
    gap   = GAPS[step]
    since = daysBetween(task.lastReminderAt ?? task.assignedAt, today)
    if since >= gap:
        if quietHours.enabled and now is inside quiet window: queue for sendQueuedAt
        channel = send(task)                 // fallback chain below
        task.remindersSent  += 1
        task.lastReminderAt  = now
        write reminderLog(task, channel, result)
```

Rules that matter:
- Marking a task done stops reminders immediately — no separate cancel step, the `done == false` filter handles it.
- Step index is capped, so after the fifth reminder the gap stays at 1 day forever.
- Gaps are read from `settings/global`, never hard-coded, because the Notify screen edits them.
- Idempotency: the job must be safe to run twice in a day. Guard on `lastReminderAt` being today.
- Deploy with `firebase deploy --only functions`. Scheduled functions need the Blaze plan; at this volume the bill is zero.

### Channel fallback chain

Try in order, stop at first success, log every attempt:

1. **FCM push** — free, unlimited. Send to every token on the user record; prune tokens that come back unregistered. Fails when the app is uninstalled, which is exactly when fallback matters.
2. **Telegram bot** — free, unlimited, easiest. Create via `@BotFather` → `/newbot`. Each member opens the bot once and presses Start; a webhook captures their `chat_id` and writes it to `users/{uid}.telegramChatId`. Send with `POST api.telegram.org/bot<token>/sendMessage`. **Add inline buttons so a member can mark a task done from the chat** — this is the highest-value extra, because it removes the need to open the app at all.
3. **WhatsApp Cloud API** — Meta developer app → add WhatsApp product → register number → permanent system-user token. Business-initiated messages require a pre-approved template, e.g. `Reminder: {{1}} for {{2}} is {{3}} days overdue.` Number verification and template review are the slow parts. Meta changes pricing and free-tier terms often; check current rates for Bangladesh before depending on it.
4. **Textbelt SMS** — free key allows one message per day. Use only for tasks already at the daily-reminder stage. If SMS matters, buy a local Bangladeshi gateway in bulk instead.

Message copy pattern: `{TaskType} for {EP-code} {Bengali title} is {n} days overdue. Reply/tap when done.`

---

## Screens

Nine views. Bottom tab bar has four items — **Board, Episodes, Team, Notify** — on a `#1b1a17` bar with a `#ffc20a` dot above the active label. A `#ffc20a` floating "+" button (54×54, circular, bottom-right, 18px from the right edge, 96px from the bottom) opens Assign, and **appears only on Board, Episodes, episode detail, Team and person detail** — never on Assign, Requests or Notify, where it covers controls.

Screen header: `#1b1a17` bar, 40px circular logo on the left, screen title at 16px/600 white, a monospace subtitle at 11px in `rgba(255,255,255,.5)`, and a yellow-outlined "Back" pill on the right for episode detail, person detail, Assign and Requests.

### 1. Board (`today`)
Admin home. Three equal stat cells on white, separated by 1px `#e6e1d6` gutters: **Overdue** (count, in `#a3210f`), **Open tasks**, **Done** — each a 26px monospace number over a 10px label.

Below, if any registrations are pending: a dark `#1b1a17` banner, 12px radius, with a yellow circle holding the count, "Registrations awaiting approval", a monospace line of first names, and a yellow "→". Tapping it opens Requests.

Then **Needs chasing** — the open-task list sorted by escalation step descending, then by due date. Each card: white, 1px `#e8e3d8`, 12px radius, with a 3px heat bar across the top whose fill width encodes the escalation step (12% → 32% → 56% → 80% → 100%). Inside: a 32px dark avatar circle with yellow initials, the task type at 13.5px/600, a monospace meta line (`EP-41 · Rizu Ahmed · 4d overdue`), a heat badge on the right, then a row with a countdown chip (`Reminder #4 today · daily`) and a `#ffc20a` **Nudge now** button.

Finally **Reminder feed** — a hairline-separated list of recent sends: a small channel tag (`WA`, `TG`, `SMS`), the message summary, the time.

Section header carries the monospace legend `7 → 4 → 3 → 2 → 1 days`.

### 2. Episodes
Top card, `#1b1a17`, 14px radius: **Slate completion** label, a summary line (`4 of 11 tasks closed across 3 episodes`), and a **42px `#ffc20a` monospace percentage**, with a 7px yellow-on-translucent progress bar beneath.

Then one card per episode: monospace `EP-41` in `#b57f00`, air date on the right, the Bengali title at 16px/600 beside a **24px monospace percentage**, a 6px dark progress bar, and a footer line pairing `4 of 5 tasks done` with a risk label (`2 overdue` in `#a3210f`, or `on schedule` in `#3f5261`).

### 3. Episode detail
Header block on white: **Episode completion** label, a progress line, and a **38px monospace percentage** right-aligned, over a 7px bar.

Then **Member status** — one card per member with tasks in this episode. Card header: 32px avatar, name, a monospace sub-line (`Voice · 0/1 done · via WhatsApp`), a heat/overdue badge, and that member's **own completion percentage** at 15px monospace. Beneath, one row per task: a 20px tick box (dark filled with a yellow ✓ when done), the task type, a monospace note (`4d overdue · reminder #4 in 0d`), and a compact **Nudge** button. Tapping the box toggles done.

This is the episode-wise segmentation the client asked for: episode → members → their tasks, with percentages at every level.

### 4. Team
One row per **approved** member: 38px avatar, name, a sub-line of craft plus the episode codes they are on, an open-task count badge tinted by their worst escalation step, and their channel. Pending users never appear here.

### 5. Person detail
Two buttons at the top: **Nudge all open** (yellow — sends one message covering all their open tasks and bumps every one's step) and **Assign task** (dark). Then their tasks across all episodes, each with a heat badge and a countdown chip.

### 6. Access requests
Intro line: "Anyone can install the app and register. Until you approve them they see a holding screen and cannot be assigned work."

One card per pending registration: 36px light avatar, name at 14px/600, a monospace meta line (`+880 17•• ••4192 · registered 2 hours ago`), a "Pending" badge, the applicant's own note in a grey quote block, then **Decline** (outlined, flex 1) and **Approve as {craft}** (yellow, flex 2).

Empty state: dashed-border card, "No pending registrations. New sign-ups from the Play Store land here."

Below, **Approved accounts** — a compact list with a per-row **Revoke** which sends the account back to the pending queue.

### 7. Assign
Vertical form, each group labelled with a 10px uppercase monospace caption:

- **Assign to** — wrapping row of person pills (22px avatar + first name); selected pill goes dark with a yellow avatar.
- **Episode** — full-width rows; selected row gets a `#fff8e3` fill, `#ffc20a` border and a filled dot.
- **Task** — 2-column grid of the nine task types; selected tile inverts to dark.
- **Due in** — a stepper: −/+ squares around a 22px monospace day count, minimum 1.
- **Reminder ladder** — a dark card with five bars rising left to right, each tinted with that step's heat color and labelled `7d 4d 3d 2d 1d`, plus a sentence restating the ladder from live settings.
- **Send via** — three equal tiles: WhatsApp (free tier), Telegram (unlimited), SMS (1/day).
- Submit: full-width yellow button, "Assign to {FirstName} & notify". On submit, create the task, jump to that episode's detail, and toast "…assigned · first reminder in 7 days".

### 8. Notify (settings)
Four sections.

**Admin access** — a dark card: yellow "KS" avatar, "Master admin" with a yellow **Verified** badge, the address `owner@kahiniscope.example` in monospace, and a note that it is fixed in the backend and cannot be claimed or changed from inside the app. Below it, a white list of approved members with a **Make admin** / **Demote** button each, and a line explaining that only the master admin can promote, demote or edit the ladder. **Render these controls for the owner only.**

**Delivery channels** — one card per channel: name, a status tag (Primary / Fallback / Last resort / Off), the free-tier limit in monospace, a 44×26 toggle, and when on, the endpoint plus a **Test send** button. Closing note: channels are tried in order, falling through WhatsApp → Telegram → SMS.

**Escalation schedule** — five rows, each a numbered dot tinted with that step's heat color, a label (`First reminder after`, `Then every`…), and a −/+ stepper on the day count, minimum 1. Footer: "After step 5 the reminder repeats daily until the task is marked done." Writes to `settings/global.plan`. **Owner only.**

**Quiet hours** — explanatory sentence plus a toggle. No reminders 22:00–08:00; queued sends go at 09:00.

### 9. Member app
Two states, decided by `users/{uid}.status`.

**Pending** — centred on `#f7f5f0`: the 76px logo, "Waiting for approval" at 20px/600, an explanatory paragraph, a white pill with a yellow dot reading `Registered as {craft} · pending`, and a footer line, "We will message you on WhatsApp the moment it is approved."

**Approved** — a `#ffc20a` header with the date in monospace, a greeting (`2 tasks waiting on you`, or `All clear`), and a sub-line. Then one card per task: a 4px heat bar, the episode code and heat badge, the task type at 17px/600, the Bengali episode title, a grey note chip (`4d overdue · next reminder today`), and a full-width **Mark done** button (dark with yellow text; becomes an outlined **Reopen task** once done, with the title struck through). Closing dashed card explains the channel order and that marking done stops reminders.

---

## Interactions

- **Approve** → set `status: "approved"`, toast `{Name} approved as {craft} — dashboard unlocked`, and the member's app flips from the holding screen to their dashboard on the next snapshot. Send them a welcome message on their best channel.
- **Decline** → delete the user document (and the auth user).
- **Revoke** → set `status: "pending"`; they drop out of Team and the assign picker immediately.
- **Nudge now** → `remindersSent += 1`, `lastReminderAt = now`, send, log, toast `Sent to {Name} via {Channel} — {Task}, {EP}`.
- **Nudge all open** → one combined message listing every open task, bumping each one's step. Toast `One message with {n} tasks sent to {Name} via {Channel}`.
- **Toggle done** → flips `done`; toast `{Task} marked done — reminders stopped` or `{Task} reopened — reminders resume`. Recompute every percentage from the same snapshot.
- **Promote / demote** → Cloud Function, owner claim required; toast `{Name} is now an admin` / `{Name} is back to member access`.
- **Ladder stepper** → writes `settings/global.plan`; every countdown in the app recalculates from it.
- Toasts: dark `#1b1a17` pill with a yellow dot, 16px from each edge, 104px from the bottom, auto-dismissing after 2.6s.
- All list data should come from live Firestore snapshots so two admins never see stale state.

---

## Design tokens

**Colors**

| Token | Hex | Use |
| --- | --- | --- |
| Ink | `#1b1a17` | Text, header bar, nav bar, primary buttons, progress fill |
| Brand yellow | `#ffc20a` | Accent, FAB, primary action buttons, member header, verified badge |
| Yellow hover | `#ffd451` | Pressed/hover on yellow |
| Yellow deep | `#b57f00` | Episode codes, links |
| Page | `#f4f1ea` | Canvas behind the phones |
| Surface | `#ffffff` | Cards |
| Surface alt | `#f7f5f0` | Screen background, inset chips |
| Surface sunken | `#f9f7f2` | Quote blocks, done rows |
| Fill | `#f0ece2` | Stepper squares, unselected avatars |
| Hairline | `#e8e3d8` | Card borders |
| Hairline strong | `#e0dacd` / `#ddd5c4` | Input borders, tick boxes |
| Danger | `#a3210f` | Overdue counts |
| Success | `#2f6b45` on `#edf3ee` | Done / clear badges |

**Escalation heat scale** — background / foreground / label / bar width, by reminders sent:

| Step | Background | Foreground | Label | Bar |
| --- | --- | --- | --- | --- |
| 0 | `#eef1f4` | `#3f5261` | On track | 12% |
| 1 | `#fff4d6` | `#8a6400` | Reminded | 32% |
| 2 | `#ffe7cd` | `#8d4500` | Chasing | 56% |
| 3 | `#ffdbd0` | `#94331a` | Escalated | 80% |
| 4+ | `#fdd0cc` | `#a3210f` | Daily | 100% |

**Typography** — two families, no others.

- `Space Grotesk` — all UI text and headings. Weights 400/500/600/700.
- `IBM Plex Mono` — every number, count, percentage, countdown, code, endpoint, timestamp and uppercase caption. Weights 400/500/600.

Scale as used: 42/38/26/24/22 monospace for percentages and stat numbers; 24/20/17/16 semibold for titles; 13.5/13/12.5 semibold for card titles; 12/11.5/11 for body; 10.5/10/9.5 monospace for meta; 10px uppercase monospace with `.1em` tracking for section captions. Line heights 1.2 for headings, 1.4–1.65 for body. **Nothing below 9px, and no tap target below 44px** — the tick boxes in episode detail need their row padding to reach 44px on device.

**Radii** — 4px badges, 6–8px chips and tick boxes, 9–13px cards, 99px pills and toggles, 50% avatars.

**Spacing** — 14px screen padding, 8–10px between cards, 12–14px inside cards, 6–7px between chips. Use flex/grid with `gap`, not margins.

**Assets** — `assets/kahiniscope-logo.png`, the client's own logo (2937×2937, transparent PNG): yellow disc, black Bengali wordmark. Use it for the header mark, the pending screen, the launcher icon and the 512×512 Play listing icon. No other imagery exists; do not generate substitutes.

---

## Content

Nine task types, exact strings: `Script writing`, `Translation`, `Voice recording`, `Dubbing / mixing`, `Editing`, `Thumbnail / graphics`, `Upload & SEO`, `Music / SFX`, `Proofreading`.

Episode titles are Bengali; the interface is English. Sample episodes in the prototype: `EP-41 রক্তমুখী নীলা`, `EP-42 শেষ ট্রামের যাত্রী`, `EP-43 কুয়াশার নিচে`. Sample people and phone numbers in the prototype are placeholders — seed real ones, and make sure the app renders Bengali text correctly (bundle a Bengali-capable font fallback; Space Grotesk has no Bengali coverage).

---

## Build order

1. Firebase project, Google sign-in, the `OWNER_EMAIL` claim trigger, Firestore rules. Verify a second Google account lands as pending and can read nothing.
2. Expo app scaffold, package `com.kahiniscope.production`, logo as icon and splash.
3. Board, Episodes, episode detail, Team, person detail against live Firestore.
4. Requests and the approval flow, both sides.
5. Assign flow.
6. Notify screen, with the owner-only sections gated on the claim.
7. Member app, both states.
8. Escalation function + FCM + Telegram bot with inline done buttons. Test by backdating `assignedAt`.
9. WhatsApp templates and the SMS last resort.
10. `eas build --platform android --profile production`, then Play Console.

## Play Store notes

25 USD one-time developer fee plus identity verification — start it first, it takes days. Store listing needs a 512×512 icon, a 1024×500 feature graphic, two phone screenshots, a content rating questionnaire, a data safety declaration (you collect names, emails, phone numbers — declare them) and a privacy policy at a public URL.

**If the Play Console personal account was created after 13 November 2023, production access requires a closed test with at least 12 testers opted in continuously for 14 days.** Recruit 15 to absorb dropouts, real devices and real Google accounts only, and watch engagement from day one. Organisation accounts and older personal accounts are exempt. Plan this in parallel with the build, not after it.

## Files in this bundle

- `design/Kahiniscope Production.dc.html` — the interactive prototype (both phones)
- `design/Build and Ship Guide.dc.html` — architecture and deployment narrative
- `design/ios-frame.jsx`, `design/doc-page.js` — preview scaffolding only, ignore
- `assets/kahiniscope-logo.png` — the brand mark
