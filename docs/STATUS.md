# Project status

Last updated: **19 September 2026**

A running record of where this stands and what is left. Written to be read
cold, after a gap, by someone who has forgotten the details.

---

## One-line summary

The backend is built, tested and **live in production**. CI and deployment are
automatic. The Android app is complete in code but **has never run on a
phone** — the first development build was queued on 19 September and is the
next thing to check.

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

**Tests: 113 backend, 75 app.** All green. `npm test` at the root runs the
backend suites (unit + five emulator suites); `npm run verify` in `mobile/`
runs typecheck, unit tests and a render of every route.

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
- **13 functions deployed**, rules and indexes released.
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

`mobile/.env.example` and `functions/.env.example` document every key. The
deployed backend does not depend on the local copies — GitHub secrets
(`OWNER_EMAILS`, `FIREBASE_SERVICE_ACCOUNT`) drive the deploy.

## Immediately next

1. **Check the development build.** Queued 19 Sep, id
   `ca6dbc22-006c-4d82-9432-d87979d91cee`:
   `cd mobile && npx eas-cli@latest build:view ca6dbc22-006c-4d82-9432-d87979d91cee`
2. Install the APK on an Android phone, then `npx expo start --dev-client`.
3. Work the test list below.

### First-run test list

1. Sign in with an owner address → should land on **Board**, not the holding
   screen.
2. Allow notifications → registers the FCM token into `users/{uid}.fcmTokens`.
3. **+ → New episode** → check the Bengali title renders rather than showing
   boxes.
4. Assign yourself a task due in 1 day.
5. **Nudge now** → the toast names the channel; the phone should buzz (push).
6. Sign in on a second account → lands pending, appears in **Requests**.
7. Mark done → strikes through, reminders stop.

Known failure modes: `DEVELOPER_ERROR` at sign-in means the SHA-1 does not
match (verified correct as of 16 Sep — cert `c616e477…706b`); silent push
means `fcmTokens` is empty.

---

## TBD

### Blocking a real launch

- [ ] **Run the app on a phone.** Nothing below matters until this happens.
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
