# Play Console — Data safety answers

Read straight off what the app actually does. The Play form asks about
**collection** (leaves the device) and **sharing** (goes to a third party).

## Overview answers

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** — Firebase and every messaging API are HTTPS/TLS only |
| Do you provide a way for users to request that their data be deleted? | **Yes** — by email to the admin; see the privacy policy |
| Does your app contain ads? | **No** |
| Is your app designed for children? | **No** |

## Data types to declare

For every row below: **collected = yes, shared = no**, unless the Sharing
column says otherwise. Nothing is "processed ephemerally" — it is stored.

| Data type | Category | Collected | Shared | Required? | Purpose |
| --- | --- | --- | --- | --- | --- |
| Name | Personal info | Yes | No | Required | App functionality |
| Email address | Personal info | Yes | No | Required | App functionality, Account management |
| Phone number | Personal info | Yes | **Yes** — to Meta (WhatsApp) and Textbelt, only when those channels are enabled | Required | App functionality |
| User IDs | Personal info | Yes | No | Required | App functionality |
| Other user-generated content | Messages / Other | Yes | No | Optional | App functionality — the note written at registration |
| Other actions | App activity | Yes | No | Required | App functionality — tasks assigned and completed |

### Notes for the reviewer's questions

- **Push tokens** are not a declarable data type on their own; they are covered
  by "User IDs" / App functionality.
- **Telegram chat id** is likewise a user identifier, covered by "User IDs". It
  is created only if the member chooses to connect Telegram.
- **Phone number sharing** is conditional: it leaves the app only when the
  owner has switched WhatsApp or SMS on. Both ship **off**. Declare it as
  shared anyway — the capability is in the app, and a declaration that depends
  on a setting is a declaration that will be wrong one day.
- **No location, contacts, photos, files, calendar, health, or financial data**
  is collected. Do not tick any of those.
- **No advertising or analytics SDK** is present. "App activity" here means the
  app's own task records, not usage analytics.

## Permissions the app requests

| Permission | Why |
| --- | --- |
| `INTERNET` | Talks to Firebase |
| `POST_NOTIFICATIONS` | Reminders. Asked for at runtime on Android 13+ |
| `VIBRATE` | So a reminder is noticed |

Three permissions that the tooling contributes are explicitly **blocked** in
`app.config.ts` and removed at manifest-merge time: `SYSTEM_ALERT_WINDOW`
(draw over other apps), `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`.
The app does none of those things, and every permission in a listing is
something the review — and the team installing it — will reasonably ask about.

## Content rating questionnaire

- Category: **Productivity** (not a game).
- No violence, sexuality, profanity, drugs, gambling, or user-to-user content
  that is publicly visible.
- Users can share content with each other? **No** — an admin assigns tasks;
  there is no messaging between users inside the app.
- Expected rating: **Everyone / PEGI 3**.
