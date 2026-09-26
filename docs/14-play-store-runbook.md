# Publishing to Play — the runbook

`docs/10-release.md` is the reference: what was verified before the first
build, what the pre-flight caught, what is in `mobile/store/`. This is the
ordered list of things to actually do, in the order they have to happen,
written for a first app.

Where the two disagree about a detail, 10 is the reference and this is the
schedule.

---

## The shape of it

The step that surprises people is not the build. It is that a **new** Play
Console account cannot publish to production until it has run a **closed test
with at least 12 testers opted in for 14 continuous days**. The clock does not
start until the account is verified and a build is uploaded, and it cannot be
shortened.

| | How long |
| --- | --- |
| Developer account + identity verification | 2–7 days, sometimes longer |
| Build, listing, upload | a day |
| **Closed test** | **14 days, fixed** |
| Production review | 2–7 days |

So: **three to five weeks**, and the only queue you do not control is the
first one. Open the account before doing anything else, and do the rest while
it is being verified.

Organisation accounts and personal accounts created before 13 November 2023
are exempt from the closed test. A first account today is not.

---

## 1. Open the developer account

<https://play.google.com/console/signup> — **25 USD, once**, then identity
verification with a government ID.

This is the critical path. Everything else waits on it, and nothing about it
goes faster for being started later.

## 2. Create the support address

A new address, for example `kahiniscope.support@gmail.com`.

It goes on the public listing and in the privacy policy, so it is public by
definition. **Do not use the owner account.** That is the single login that
can approve members, assign work and mark payments; publishing it on a store
page invites attempts at it.

Then, in the GitHub repository:

- **Settings → Secrets and variables → Actions → Variables → New** —
  name `SUPPORT_EMAIL`, value the address. A variable and not a secret: it is
  printed on the listing, so it is not secret. It lives there so it exists in
  one place rather than twice in the policy text.
- **Settings → Pages → Source: GitHub Actions**.

## 3. Publish the privacy policy

Play rejects a listing without a policy at a public URL.

The page is generated from `mobile/store/privacy-policy.md` by
`site/build.mjs` and published by `.github/workflows/pages.yml`. There is one
copy of the text; edit the markdown and the live page follows.

Once step 2 is done, the workflow publishes to:

```
https://krdevil74.github.io/Kahiniscope/privacy
```

The build **fails** if `SUPPORT_EMAIL` is unset rather than publishing a page
that reads `<support address>` — which is the kind of thing that ships
because nobody opened the rendered output.

## 4. Screenshots

At least two; four to six is better.

```bash
cd mobile && npm run screenshots
```

Captures over `adb` from a real phone with the app installed. They are
captured rather than drawn on purpose: the prototype is in an **iOS device
frame**, and a store screenshot that does not match what installs is the one
thing a listing must never do.

Use real data rather than the demo seed if the phone has it — the screens
read better with real Bengali episode titles in them.

## 5. The production build

```bash
cd mobile && npm run build:production
```

This produces an **AAB**, not an APK. Play will not accept an APK for a new
app.

Verified before the first attempt: the EAS **production** environment already
carries the Firebase config and `GOOGLE_SERVICES_JSON`, so this build will not
reproduce the blank-screen failure the very first preview APK had, which was a
build with no `EXPO_PUBLIC_*` variables in it.

### Back up the signing key, the same day

```bash
cd mobile && npx eas-cli@latest credentials
```

Download the keystore and put it somewhere that is not this laptop.

**Losing it means never being able to update this app again** under
`com.kahiniscope.production`. Not "difficult" — Play identifies an app by its
signing key, and a new key is a new app: a new listing, and every user
reinstalling. This is the most common irreversible mistake on a first app, and
it costs nothing to avoid today.

## 6. Fill the listing

Everything is written already:

| Where | What |
| --- | --- |
| `mobile/store/listing.md` | Title, short and full description, category, tags |
| `mobile/store/data-safety.md` | The exact answers for the data-safety form and content rating |
| `mobile/assets/store-icon-512.png` | 512×512, no alpha |
| `mobile/assets/store-feature-graphic-1024x500.png` | 1024×500, no alpha |

### The data-safety answer that is easy to get wrong

Declare the phone number as **shared**. It goes to Meta or to Textbelt in
order to deliver a message. Both of those channels ship switched off, so today
nothing leaves — but the capability is in the app, and a declaration that is
only true while a setting stays untouched is a declaration that will be wrong
one day.

## 7. The closed test

Upload the AAB to a **closed** track, then recruit testers.

- **Recruit 15, not 12.** The requirement is twelve opted in continuously;
  fifteen absorbs the dropouts that would otherwise restart the fortnight.
- **Real devices, real Google accounts.** Emulators and duplicate accounts do
  not count, and Google checks.
- **Watch the opt-in count from day one, not day thirteen.** Somebody opting
  out is something to notice the same week.
- The production team plus friends is fine.

The best use of those two weeks is to **run one real episode through the app**.
It is a genuine test, it keeps the testers engaged, and it is the only way
some of the list below gets proven.

## 8. Apply for production, release staged

After fourteen continuous days, apply for production access. Release with a
staged rollout rather than to everyone at once.

---

## Still unproven on a real device

Worth closing during the fortnight, while there is room to fix things:

- **A push notification arriving on a phone.** Nothing has ever been delivered
  to a device.
- **A Telegram reminder arriving with its Mark done button.** The bot, the
  webhook and the outbound send are proven; an invite link actually writing a
  `telegramChatId`, and a reminder landing in a chat, are not.
- **The first real `escalateDaily` run** at 09:00 Dhaka against real data.
- **WhatsApp and SMS** remain off. `docs/09` has the switch-on path and the
  real costs.

## A note on rebuilding

The payments rules moved the member's write on `tasks` from `done` to
`status`. A build older than 23 September 2026 **cannot submit work** against
the rules now in production. Anyone still on an older APK will get a
permission error on "Submit for review", so the build in step 5 is not
optional for the team even before it reaches Play.
