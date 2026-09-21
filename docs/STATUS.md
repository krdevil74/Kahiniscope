# Project status

Last updated: **21 September 2026** (payments)

A running record of where this stands and what is left. Written to be read
cold, after a gap, by someone who has forgotten the details.

---

## One-line summary

The backend is live and the app **runs on a phone**: signed in, assigning
work, reminders reaching the device. The first-run list was worked on 20–21
September and turned up four real bugs, all fixed and merged. The work since
is features, not commissioning.

---

## What is done

All ten steps of the handoff's build order, plus CI/CD.

| Step | State |
| --- | --- |
| 1. Firebase, Google sign-in, owner claim, rules | done, deployed |
| 2. Expo scaffold, package, icons, splash | done |
| 3. Board, Episodes, episode detail, Team, person detail | done |
| 4. Requests and the approval flow | done |
| 5. Assign flow | done |
| 6. Notify screen, owner-only gating | done |
| 7. Member app, both states | done |
| 8. Escalation engine, FCM, Telegram bot | done, deployed |
| 9. WhatsApp and SMS adapters | done, **shipped switched off** |
| 10. Build and Play listing materials | materials written; **no build shipped** |
| CI / deploy workflows | done, green |

**Tests: 164 backend, 142 app.** All green. `npm test` at the root runs the
backend suites (unit + rules + six emulator suites); `npm run verify` in
`mobile/` runs typecheck, unit tests and a render of all 17 routes.

**Local gotcha:** `functions/.env` shadows the `OWNER_EMAILS` the test scripts
set, so the auth suite fails on a machine that has one. `functions/.env.kahiniscope-demo`
(gitignored, project-scoped, holds `owner@kahiniscope.test`) fixes it. CI never
hit this because `functions/.env` is not in the repo.

## Live infrastructure

- **Firebase project id: `kahiniscope-5c9ee`** (display name "Kahiniscope").
  There is also an empty `kahiniscope-production` project in the same account —
  a trap. Nothing uses it. Worth deleting once its service account is no
  longer referenced anywhere.
- **Firestore: `asia-south2` (Delhi).** Fixed at creation, cannot move.
- **Regions differ on purpose** — three constants in `functions/src/config.ts`:
  `REGION` = asia-south2 (Firestore triggers must sit with the database),
  `BLOCKING_REGION` = asia-south2, `SCHEDULER_REGION` = **asia-south1**
  because Cloud Scheduler does not exist in asia-south2.
- **13 functions deployed**, rules and indexes released. The contacts work
  adds five more, not yet deployed.
- **Two scheduled jobs are armed and have never been observed running:**
  `escalateDaily` at 09:00 Asia/Dhaka, `purgeOldData` Sundays at 03:00.
- **GitHub: `krdevil74/Kahiniscope`, public.** Push to `main` → CI → deploy,
  automatically.

## Local files that are NOT in the repo

Gitignored, and they must exist for anything to work locally. If the machine
is wiped, these are what has to be recreated:

| File | Contains |
| --- | --- |
| `functions/.env` | `OWNER_EMAILS` (two addresses), `TELEGRAM_BOT_USERNAME` |
| `mobile/.env` | the `EXPO_PUBLIC_*` Firebase web config + Google web client id |
| `mobile/google-services.json` | from the Firebase console, Android app |
| `functions/.env.kahiniscope-demo` | `OWNER_EMAILS=owner@kahiniscope.test`, so `npm test` passes locally |

`mobile/.env.example` and `functions/.env.example` document every key. The
deployed backend does not depend on the local copies — GitHub secrets
(`OWNER_EMAILS`, `FIREBASE_SERVICE_ACCOUNT`) drive the deploy.

## What the first run turned up

Four bugs that could only appear on a device, all fixed in PR #1
(`9562f60`, merged, deployed):

1. **Sign-in never left its own screen.** The gate lives in `app/index.tsx`
   and only runs at `/`. Signing in updated the session and moved nothing, so
   the credential landed and the person sat looking at the button they had
   pressed. `app/pending.tsx` had the same bug: an approval arriving while the
   holding screen was open could not move them either.
2. **`expo-notifications` resolves a shim on web** rather than being absent,
   and its methods throw when called — so the module-present check was not
   enough and `getLastNotificationResponseAsync` took the web render down.
3. **A bundle built without the `EXPO_PUBLIC_*` variables** got an empty
   Firebase config and died at module load: an instant crash back to the
   launcher with nothing to read. `firebase.ts` now names the missing keys.
4. **No `google-services.json` in the APK.** It is gitignored, EAS builds from
   a git archive, and no EAS secret was set — so the native Firebase app never
   initialised and FCM could not issue a token.

### What EAS needs, and now has

Both remote-build failures were the same shape: a gitignored file is not on
the build server. Set on the EAS project (all three environments):

- `GOOGLE_SERVICES_JSON` — file type, secret
- the seven `EXPO_PUBLIC_*` values — string, plaintext (they are public
  identifiers; the boundary is the rules and the claims)

Do **not** put `EXPO_PUBLIC_EMULATOR_OWNER` there: `docs/10` records the owner
address leaking into the bundle through it once already.

The GitHub Actions build path (`android-build.yml`) wants the same values as
repo secrets and still has none — `EXPO_TOKEN` and `GOOGLE_SERVICES_JSON` are
both unset, so that workflow has never run. CLI builds are the working path.

### First-run test list — worked, 21 Sep

Sign-in, the board, adding an episode with a Bengali title, assigning, and
**Nudge now** all confirmed on a real phone. Still unproven on a device: a
second account registering and being approved, and push actually arriving
(the rebuild carrying `google-services.json` is `088d4596`).

Known failure modes: `DEVELOPER_ERROR` at sign-in means the SHA-1 does not
match (verified correct as of 16 Sep — cert `c616e477…706b`); silent push
means `fcmTokens` is empty.

## Since the first run: what was added

Asked for on 21 September, built on `feat/contacts-crafts-and-messaging-docs`:

- **A person has several crafts, not one.** `craft: string` became
  `crafts: string[]`, capped at five, editable by the person at registration
  and by an admin on the person page. Old records read as a list of one, so
  there is no migration to run.
- **The "Assign to" row scales.** Search by name or craft, and the chips
  collapse behind "+ n more" past six people — the selected person is never
  among the ones hidden.
- **People with no app.** An admin adds somebody against a phone number from
  **Team → Add someone without the app**. They are assignable immediately and
  the board counts them. Marked `accountless: true`, with no Firebase Auth
  user behind them; the phone number is the identity, normalised on the server
  and unique across every user record. Push is not on their chain — there is
  no device — so the admin picks WhatsApp, Telegram or SMS.
- **Telegram for somebody with no app.** Only they can create a chat id, so
  the person page mints an invite link and hands it to the share sheet. The
  same single-use token and the same webhook as the app's own Connect
  Telegram.
- **Merging a contact into a real account.** When they finally install the
  app and register with the same number, the approval queue says so — naming
  the contact and its open tasks — and offers **Approve & link**, which moves
  the tasks, carries the crafts and the channel over, deletes the contact and
  approves the account in one commit. Deliberately an admin decision: a number
  typed into a form is a claim, not a proof.
- **`docs/12-messaging-integration.md`** — WhatsApp and Telegram end to end,
  including the contact flow and the troubleshooting tables.

Five new callables, all admin-gated: `addContact`, `updateContact`,
`removeContact`, `contactTelegramLink`, `approveAndLinkContact`.

## Submitting, reviewing and payments

Asked for on 21 September, built on `feat/payments`. Full detail in
`docs/13-payments.md`.

- **Work is handed in, not closed.** `Mark done` became `Submit for review`.
  A task is `open`, `submitted`, `approved` or `paid`, and only an admin moves
  it past submitted. Reminders stop the moment work is submitted — the member
  is no longer the one who is late.
- **Rejection is not a state.** Sending work back puts the task at `open` with
  `rejectedAt` and a required reason, which is what the escalation engine
  reads to chase it **every other day** instead of climbing the ladder.
- **Rates are per person.** Voice carries two (character and narration,
  different figures for the same artist), sound design per minute, cover
  design per cover. Everything else is a figure the admin types. A blank is
  not zero — it means "no rate for this".
- **Approving opens a payment** with the rate snapshotted, so raising
  somebody's rate later cannot restate what past work was worth. The member
  sees an estimate under a disclaimer; the admin sets the real figure when
  paying, and it is allowed to differ.
- **A Payments tab for both sides.** The admin gets a queue with the working
  shown and an amount field pre-filled with the estimate. The member gets paid
  all-time and pending-estimate, kept strictly apart.

`done` still exists, written alongside the status and meaning what it always
meant — accepted — so every percentage and the escalation query keep working.
A task written before any of this reads as `approved`, and no migration runs.

Two new callables: `reviewTask`, `markPaymentPaid`. One new collection,
`payments`, that no client may write.

---

## TBD

### Blocking a real launch

- [x] **Run the app on a phone.** Done 20–21 Sep.
- [x] **Deploy the contacts work.** Merged and deployed 21 Sep.
- [ ] **Deploy the payments work**, rules and functions together. The member
      write on `tasks` moved from `done` to `status`, so an app built from
      this branch cannot submit anything against the old rules — and an old
      build cannot mark anything done against the new ones. Ship the APK after
      the deploy, not before.
- [ ] **Confirm push on the device** with build `088d4596` — `fcmTokens`
      non-empty, then **Nudge now** buzzes.
- [ ] **Telegram bot.** `TELEGRAM_BOT_TOKEN` is the placeholder `unset`, so
      the channel reports itself unconfigured and is skipped. Needs
      `@BotFather` → `/newbot`, then `firebase functions:secrets:set
      TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` in `functions/.env`, and
      `setWebhook`. See `docs/08`.
- [ ] **Watch the first real `escalateDaily` run** at 09:00 Dhaka. It has
      never fired against real data.
- [ ] **Play Console**: developer account, identity verification (days), then
      the 14-day / 12-tester closed test if the account is newer than
      13 Nov 2023. Recruit 15. This is the long pole — start before the build
      is ready, not after.
- [ ] **Screenshots** for the listing: `npm run screenshots` captures from a
      real device over adb. Not yet possible — no device has run the app.
- [ ] **Privacy policy needs a public URL** and a **support contact address**
      filled in (`mobile/store/privacy-policy.md` has a placeholder; the note
      there argues against using the owner account).

### Worth doing, not blocking

- [ ] **`firebase-functions` 6.6.0 → 7.3.2.** A major version with breaking
      changes; deliberately deferred while the first deploy was being fought
      through. The CLI nags on every deploy.
- [ ] **Delete the empty `kahiniscope-production` GCP project** once nothing
      references its service account.
- [ ] **Back up the EAS keystore** (`eas credentials` → download). Losing it
      means never being able to update the app under this package name.
- [ ] **Workload Identity Federation** instead of the long-lived
      `FIREBASE_SERVICE_ACCOUNT` JSON key, if more than one person ever pushes.
- [ ] WhatsApp and SMS remain off. `docs/09` has the switch-on path and the
      real costs. Both were built so this is configuration, not code.

### Deliberately not doing

- **WhatsApp by default.** It bills per message; the design's "1,000 free
  conversations" is Meta's old model. Push and Telegram cover everyone for
  nothing.
- **SMS by default.** Textbelt's free key is one message a day for the whole
  key, not per person.
- **Auto Android builds on push.** EAS free tier is a handful of builds a
  month; the build workflow is `workflow_dispatch` only.

---

## Decisions worth not relitigating

- **Claims are the security boundary**, not the UI. Rules read
  `request.auth.token.role` / `.status`, minted by Cloud Functions.
- **Percentages are never stored**, always counted from the snapshot on screen.
- **The escalation ladder is read from `settings/global`**, never hard-coded,
  by both the app and the scheduled job. They are separate implementations and
  must agree — both are unit tested against the same examples.
- **The channel order is push → Telegram → WhatsApp → SMS**, taken from the
  handoff's escalation-engine section. The Notify screen's copy said
  WhatsApp first; that contradiction was resolved in favour of the engine, and
  the status tags on that screen are now derived from the real order rather
  than being fixed strings.
- **The owner address is not in the repo.** `OWNER_EMAILS` comes from the
  environment. Git history was rewritten on 15 Sep to remove it, along with
  the author email, which is now a GitHub noreply address.
- **Retention is one year** for episodes, tasks and reminderLog, with a
  90-day floor whatever the settings say. The privacy policy states this, so
  changing one means changing the other.
- **`asia-south1` would have been the better home for the database.** Same
  distance from Dhaka, full service coverage, one region instead of two. Not
  worth moving now — a Firestore location cannot be changed.

## Where the detail lives

`docs/01` through `docs/11`, one per build-order step plus CI. Each records
what was built, what was verified, and what was deliberately left out.
