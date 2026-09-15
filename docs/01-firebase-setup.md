# Step 1 — Firebase project, Google sign-in, owner claim, Firestore rules

Everything in this repository runs against the emulators today. This document
covers the part that cannot be automated: creating the Firebase project and
pointing the code at it.

Build-order step 1 is complete when a second Google account can sign in, lands
pending, and can read nothing. There is an automated test for exactly that —
see [Verifying](#verifying).

---

## What is already in the repository

| Path | What it is |
| --- | --- |
| `firestore.rules` | The access matrix. Owner, admin, member, pending. |
| `firestore.indexes.json` | Composite indexes for the Board, Team and member queries. |
| `functions/src/config.ts` | `OWNER_EMAILS`, regions, default ladder. **The only place the owner address appears.** |
| `functions/src/roles.ts` | Who is the owner, and what a document is worth. Pure, unit tested. |
| `functions/src/auth.ts` | `onBeforeCreate`, `onBeforeSignIn`, `syncClaimsOnUserWrite`. |
| `functions/scripts/seed.mjs` | Creates `settings/global` with the 7 → 4 → 3 → 2 → 1 ladder. |
| `tests/rules.test.mjs` | 22 assertions against the rules, on the emulator. |
| `tests/auth.test.mjs` | The acceptance test, driving real sign-ins through the real triggers. |

---

## 1. Create the project

1. <https://console.firebase.google.com> → **Add project**. The display name
   is "Kahiniscope"; the **project id** Firebase actually assigned is
   `kahiniscope-5c9ee`, because the plain name was taken. Everything
   addresses the id, never the display name — `.firebaserc`, the deploy
   workflow and the app config all use `kahiniscope-5c9ee`.
2. **Upgrade to the Blaze plan.** Cloud Functions and the scheduled escalation
   job both require it. At a dozen tasks a day the bill is zero; set a budget
   alert at a few dollars anyway.
3. `.firebaserc` holds the project id. If you ever point this at a different
   project, change it there and set the `FIREBASE_PROJECT_ID` repository
   variable to match (`gh variable set FIREBASE_PROJECT_ID`).

## 2. Firestore

**Build → Firestore Database → Create database**, production mode, region
**`asia-south2` (Delhi)** — the region the database was actually created in.

The region cannot be changed afterwards, and `REGION` in
`functions/src/config.ts` must match it — Firestore triggers have to run in the
same region as the database.

Then push the rules and indexes:

```bash
npm run deploy:rules
```

## 3. Authentication

1. **Build → Authentication → Get started → Google**, enable it, set the
   support email.
2. **Upgrade to Firebase Authentication with Identity Platform** (the banner in
   the Authentication settings tab). The blocking triggers below are an
   Identity Platform feature; without it they cannot be registered.
3. Under **Settings → User actions**, leave account creation enabled — anyone
   can register, which is the product's intent. What they *see* is decided by
   the claim, never by whether the account exists.

## 4. Deploy the functions

```bash
npm --prefix functions install
npm run deploy:functions
```

This registers three functions:

- **`onBeforeCreate`** — first sign-in ever. Writes `users/{uid}` and returns
  the custom claims that the token is minted with.
- **`onBeforeSignIn`** — every sign-in. Re-reads the stored document, so an
  approval or promotion that happened while the user was away is on the token
  immediately.
- **`syncClaimsOnUserWrite`** — a Firestore trigger on `users/{uid}`. When an
  admin approves a registration, this re-mints the claim within a second or
  so, and the member's app unlocks without signing out.

If the deploy rejects the blocking functions with an unsupported-region error,
set `BLOCKING_REGION` in `functions/src/config.ts` to `"us-central1"` and
deploy again. Nothing else changes; sign-in costs one extra round trip.

## 5. Seed the settings document

```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
FIREBASE_PROJECT=kahiniscope-5c9ee npm run seed
```

Creates `settings/global` with `plan: [7, 4, 3, 2, 1]`, quiet hours 22:00–08:00
queued to 09:00, and the channel switches. It never overwrites an existing
document, so it is safe to re-run after the owner has tuned the ladder on the
Notify screen.

## 6. First sign-in

Sign in to the app with **the owner address**. That account, and only that
account, comes back with `role: "owner"`. Every other Google account on earth
comes back `role: "member", status: "pending"`.

---

## Verifying

```bash
npm test          # all three suites
npm run test:functions   # the owner rule, in isolation
npm run test:rules       # the access matrix, on the Firestore emulator
npm run test:auth        # real sign-ins through the real blocking functions
```

`npm run test:auth` is the acceptance test for this step. It signs in as the
owner address, signs in as a second Google account, and asserts that the second
account is pending and is refused `episodes`, `settings/global` and every other
user document — while still being able to read its own record and complete its
registration form.

It also covers the three failure modes worth knowing about:

- an **unverified** owner address gets nothing (`email_verified` is checked);
- the owner role cannot be granted to any other address, even by the owner —
  the trigger rewrites such a document back to `admin`;
- the owner cannot lock themselves out by editing their own document.

The first emulator run downloads a JAR. If it appears to hang on a fresh
machine, run `npx firebase setup:emulators:firestore` once, or prefix with
`CI=true` to skip the prompt.

---

## How access is actually enforced

Two custom claims, minted only by Cloud Functions:

```
request.auth.token.role     "owner" | "admin" | "member"
request.auth.token.status   "pending" | "approved"
```

`firestore.rules` reads those and nothing else, so the app UI is free to be
wrong without being dangerous. A token carrying no claims at all — one minted
before the triggers existed — is read as `member` / `pending`, the least
privilege available.

| | pending | member | admin | owner |
| --- | --- | --- | --- | --- |
| own `users` doc | read, register | read, FCM tokens | | |
| all `users` | — | — | read, set `status`, delete | + set `role` |
| `episodes` | — | read | read/write | read/write |
| `tasks` | — | own only; `done`/`doneAt` only | read/write | read/write |
| `reminderLog` | — | — | read | read |
| `settings/global` | — | read | read | read/write |

Written by Cloud Functions only: `reminderLog`, and the `role` / `status`
fields whenever they disagree with the owner list.

### Two deliberate departures from a literal reading of the handoff

1. **A pending account can read its own `users` document.** The handoff says a
   pending user reads nothing; it also says the member app's holding screen is
   driven by `users/{uid}.status`. Without this one read the app could never
   learn it had been approved. Everything else stays closed.
2. **A pending account can write its own profile fields** — `name`, `phone`,
   `craft`, `note` — which is how the registration form and the applicant's
   note reach the Requests screen. `role` and `status` are untouchable, so
   nobody approves or promotes themselves. Values are validated in the rules:
   craft must be one of the seven, the note is capped at 500 characters.

### On losing the Gmail account

If the configured owner address is lost, admin access goes with it. Keep two-factor
authentication on it. `OWNER_EMAILS` in `functions/src/config.ts` is an array
for this reason — add a second address you control, redeploy, and that address
becomes a co-owner on its next sign-in. Do it before it is urgent.

### Revocation timing

Demoting or revoking someone re-mints their claim and revokes their refresh
tokens immediately, but an ID token already issued stays valid until it expires
— up to one hour. For a production-management app that is an acceptable
window. If it ever is not, the rules would need to read the user document with
`get()` on every request instead of trusting the claim, at the cost of an extra
read per operation.
