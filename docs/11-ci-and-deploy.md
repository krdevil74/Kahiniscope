# CI and deployment

Three workflows. One runs on everything, one deploys, one builds the app when
asked.

| Workflow | Runs when | Needs |
| --- | --- | --- |
| **CI** | every push, every pull request | nothing |
| **Deploy** | after CI passes on `main` | `FIREBASE_SERVICE_ACCOUNT` |
| **Android build** | manually, from the Actions tab | `EXPO_TOKEN`, `GOOGLE_SERVICES_JSON` |

Both deploy workflows **skip cleanly with a notice** until their secrets exist,
rather than failing red — so the repository is not permanently broken-looking
while the accounts are being set up.

---

## CI

Two jobs, in parallel:

- **Backend** — the functions unit tests, then all five emulator suites:
  security rules, identity, the approval flow, promotion, and the escalation
  engine. Java and the emulator jars are cached, so a run is a few minutes.
- **App** — type check, unit tests, and the render pass that mounts every
  screen through react-native-web. A bad hook, a missing provider or an
  unresolvable import fails there; none of those would be caught by a type
  check.

Node 24 on the runner, because the tests run TypeScript directly through
`node --test`, which needs Node 23 or newer. The functions themselves
deploy to the `nodejs22` runtime — set in `functions/package.json` and
`firebase.json`, and independent of the runner's version.

Google decommissions a Cloud Functions runtime roughly two years after
release, and refuses deploys on a decommissioned one. `nodejs20` was
decommissioned on 2026-10-30. When a deploy log starts warning about the
runtime, that is the notice — it is a hard deadline, not advice.

The whole thing was verified by cloning the repository into a clean directory
and running each job's steps: `npm ci` in all three packages, the builds, and
the suites. 75 app tests and 27 rules tests from a fresh clone, green.

## The APIs that have to be on

Enable these on the Firebase project before the first deploy. `firebaserules`
and `identitytoolkit` are the two that are easy to miss — the first is needed
to deploy security rules at all, the second by the Identity Platform blocking
functions:

```bash
gcloud services enable \
  firestore.googleapis.com firebaserules.googleapis.com \
  cloudfunctions.googleapis.com run.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com \
  eventarc.googleapis.com pubsub.googleapis.com \
  cloudscheduler.googleapis.com secretmanager.googleapis.com \
  identitytoolkit.googleapis.com cloudresourcemanager.googleapis.com \
  iam.googleapis.com --project kahiniscope-5c9ee
```

All of them require **billing enabled** on the project. Blaze is a
prerequisite for scheduling, not a bill: the usage here sits inside the free
allowances that remain under it.

## Regions, and why they are not all the same

Three constants in `functions/src/config.ts`, because three services have
three different constraints:

| Constant | Value | Why |
| --- | --- | --- |
| `REGION` | `asia-south2` | Where Firestore is. Firestore triggers have no choice — they must sit with the database, and a database's location is fixed at creation. |
| `BLOCKING_REGION` | `asia-south2` | Identity Platform supports a shorter region list than Firestore. It happens to include this one. |
| `SCHEDULER_REGION` | `asia-south1` | **Cloud Scheduler does not exist in asia-south2.** The deploy fails with "Location 'asia-south2' is not a valid location". |

The scheduled pass has no reason to sit with the database: it wakes once a day
and talks to Firestore through the Admin SDK, which is region-agnostic. The
cross-region hop costs milliseconds on a job measured in seconds.

This is the cost of a newer, thinner region. `asia-south1` (Mumbai) carries
the full set of services and is no further from Dhaka; if the database were
being created today, that is where it would go. It is not worth moving now —
a Firestore location cannot be changed, so moving means a new database and a
migration, to save one constant.

## Deploy

Deploys `firestore:rules`, `firestore:indexes` and `functions` — the whole
backend. Not the app: an Android app is installed from the Play Store, not
deployed from a runner.

It is wired to **`workflow_run`** rather than to `push`, so it only fires once
CI has actually gone green on that same commit, and it checks out
`workflow_run.head_sha` rather than whatever `main` has drifted to since.
Security rules and a scheduled job that chases people are not things to push on
a red build.

### Setting it up

**Create the service account inside the Firebase project itself**, not in
another project you happen to own. When a service account from project A acts
on project B, Google attributes API-enablement checks to A — so the deploy
fails complaining that an API is disabled in a project you were not deploying
to. Cross-project access does work, but it makes every such error read as a
puzzle.

1. In the Google Cloud console **for `kahiniscope-5c9ee`**, create a service
   account — `github-deploy` — and give it:
   - **Firebase Admin** (or, more tightly: *Cloud Datastore Index Admin*,
     *Firebase Rules Admin*, *Cloud Functions Admin*, *Service Account User*)
   - **Cloud Build Editor** and **Artifact Registry Writer**, which deploying
     functions needs
   - **Service Usage Viewer**, so the CLI can see which APIs are on. Without
     it the CLI reads "enabled" as "missing", tries to enable it, and fails on
     permissions — an error that points at the wrong problem
2. Create a JSON key for it and download it.
3. `gh secret set FIREBASE_SERVICE_ACCOUNT < that-file.json`
4. Optionally `gh variable set FIREBASE_PROJECT_ID --body kahiniscope-5c9ee`
   if the project id ever differs from the default. The project's display
   name is "Kahiniscope"; its id is `kahiniscope-5c9ee`, and only the id is
   ever addressable.
5. Delete the downloaded file.

A long-lived JSON key is the pragmatic choice for a project this size.
**Workload Identity Federation** is the better one — no key to leak, nothing to
rotate — and is worth moving to if this repository ever has more than one
person pushing to it.

### What it does not deploy

The functions' **secrets** live in Secret Manager and are set once, by hand:

```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
firebase functions:secrets:set ESCALATION_RUN_KEY
```

They are deliberately not in the repository or in GitHub Actions. A deploy
binds functions to them by name; it never sees their values.

**Every declared secret must exist before the functions will deploy.** There
is no such thing as an optional one: the CLI looks each up and stops if it is
missing. So a project that has not set up WhatsApp still needs a
`WHATSAPP_TOKEN` to exist, and what goes in it is the literal string `unset` —
which the code reads as *not configured*, exactly as if it were empty, rather
than trying to use it as a credential.

Creating all six on a fresh project, with real values for the two that are
just shared secrets we choose:

```bash
PROJECT=kahiniscope-5c9ee

# Generated now — these are ours to pick.
printf '%s' "$(openssl rand -hex 24)" | \
  gcloud secrets create ESCALATION_RUN_KEY --data-file=- --project $PROJECT
printf '%s' "$(openssl rand -hex 24)" | \
  gcloud secrets create TELEGRAM_WEBHOOK_SECRET --data-file=- --project $PROJECT

# Placeholders until the accounts exist.
for S in TELEGRAM_BOT_TOKEN WHATSAPP_TOKEN WHATSAPP_PHONE_ID TEXTBELT_KEY; do
  printf 'unset' | gcloud secrets create $S --data-file=- --project $PROJECT
done
```

Replacing one later is `firebase functions:secrets:set NAME` followed by a
redeploy, which is what binds the new version.

## Data retention

Episodes, tasks and reminder logs older than **one year** are deleted
automatically. `purgeOldData` runs weekly — Sundays at 03:00 Dhaka, well clear
of the 09:00 escalation pass so the two never argue about the same documents.

Weekly rather than daily on purpose: the volume is a few hundred documents a
year, and a job that deletes production data should run as rarely as it can
while still doing its job.

Three choices worth knowing:

- **Open tasks are swept too.** A task nobody closed in a year is not pending
  work — it is a task from a finished episode that was forgotten. Leaving it
  means the escalation job chases somebody about EP-12 forever.
- **The window has a floor of 90 days**, whatever `settings/global` says. A
  fat-fingered `retention: { days: 3 }` would otherwise delete the current
  slate on the next run. The clamp is applied both when reading the setting
  and when computing the cutoff, so neither path can be bypassed.
- **Each collection is judged on its own clock** — episodes by air date, tasks
  by when they were assigned, logs by when they were sent — rather than by
  chasing references between them. A sweep that hits its per-run limit can
  therefore never half-delete an episode.

It can be switched off with `retention: { enabled: false }` in
`settings/global`, but only explicitly: anything else reads as on, because
unbounded growth is the thing that eventually costs money.

The privacy policy states this one-year window, so changing it means changing
that document too.

**On cost, honestly:** this is not what would have cost you money. Firestore's
free tier is 1 GiB, and this app generates a few thousand small documents a
year — retention here is data hygiene and a promise the privacy policy can
keep, rather than a bill being avoided. The thing that actually costs money is
WhatsApp, and that ships off.

## Android build

Manual, from the Actions tab, with a choice of `preview` (an APK you can
sideload) or `production` (the AAB for Play).

**On purpose it does not run on push.** EAS Build's free tier is a small number
of builds a month, and an AAB produced for every commit is an artifact nobody
asked for, burning a quota somebody will want later. It also uses `--no-wait`:
the build is queued and the runner stops, because a runner sitting idle for
twenty minutes waiting on a remote builder is minutes spent on nothing. The
result appears on expo.dev.

### Setting it up

```bash
gh secret set EXPO_TOKEN                  # expo.dev → Account → Access tokens
gh secret set GOOGLE_SERVICES_JSON < mobile/google-services.json
gh secret set EXPO_PUBLIC_FIREBASE_API_KEY
gh variable set EXPO_PUBLIC_FIREBASE_PROJECT_ID --body kahiniscope-5c9ee
# …and the remaining EXPO_PUBLIC_* values from mobile/.env.example
```

The Firebase web config values are public identifiers rather than secrets — the
boundary is the security rules and the custom claims — so they are repository
**variables**, except the API key, which is a secret purely to keep it out of
logs.

## Two notes on how these are written

**No secret is ever interpolated into a shell command.** Every one is passed
through `env:` and read as `"$VARIABLE"`. A secret pasted directly into a
`run:` line is one quoting bug away from being executed rather than written,
and on a public repository that matters more than usual.

**The `secrets` context is not available in a step's `if:`.** Checking whether
a secret exists therefore happens in a step that writes an output, and the
later steps gate on that output. That is why each deploy workflow opens with a
"Check for credentials" step.
