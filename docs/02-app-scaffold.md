# Step 2 — Expo app scaffold

The app lives in `mobile/`. Expo SDK 57, React Native 0.86, TypeScript,
expo-router, managed workflow with EAS Build. Package name
**`com.kahiniscope.production`**.

```bash
cd mobile
npm install
npm run typecheck     # tsc --noEmit
npm test              # pure logic, via node --test
npm run doctor        # npx expo-doctor — 21/21
```

---

## Identity

| | |
| --- | --- |
| App name | Kahiniscope |
| Package | `com.kahiniscope.production` |
| Scheme | `kahiniscope` |
| Version | 1.0.0 (versionCode 1) |
| Orientation | portrait |
| Interface style | light only — the design has no dark palette |

`app.config.ts` is the source of truth. There is deliberately **no `app.json`**:
`npx expo install` recreates one to record plugins it adds, and if that file
reappears, fold its `plugins` entries into `app.config.ts` and delete it again.
`npx expo-doctor` catches it.

iOS keys are absent on purpose. The prototype was drawn in an iOS frame because
that was the available preview shell; the product is Android.

## Images

Every launcher and store image is generated from the client's own logo — the
handoff is explicit that no other imagery exists and none is to be invented.

```bash
npm run icons        # mobile/scripts/make-icons.mjs
```

| File | Size | What it is |
| --- | --- | --- |
| `icon.png` | 1024 | The disc at full bleed on ink; only the corners show. |
| `android-icon-foreground.png` | 1024 | Disc at 68%, inside the adaptive-icon safe zone. |
| `android-icon-background.png` | 1024 | Solid `#1b1a17`. |
| `android-icon-monochrome.png` | 1024 | Themed icons, Android 13+. |
| `splash-icon.png` | 1024 | Disc at 62% on `#f7f5f0`. |
| `store-icon-512.png` | 512 | Play listing. Flattened — no alpha channel. |
| `notification-icon.png` | 96 | Status bar, for step 8. |
| `logo.png` | 512 | The mark as the app draws it: 40px in the header, 76px on the pending screen. |

The monochrome icon needs explaining. Android throws its colour away and paints
only the alpha channel, so the drawing has to live in the alpha. It is built
from the source's own darkness: the black wordmark becomes opaque, the yellow
disc becomes a faint plate, and everything outside the disc is empty.

The splash background is `#f7f5f0` — surface-alt, the same ground as the
pending screen — so launching into the holding screen has no visible seam.

## Typography

Two families, and a third that is not a design choice but a necessity.

- **Space Grotesk** 400/500/600/700 — all UI text and headings.
- **IBM Plex Mono** 400/500/600 — every number, count, percentage, countdown,
  code, endpoint, timestamp and uppercase caption.
- **Noto Sans Bengali** 400/500/600 — episode titles. Space Grotesk has no
  Bengali coverage, and React Native on Android does not fall back per glyph
  inside a styled `Text`: it renders tofu.

Weights are imported one at a time, from subpaths like
`@expo-google-fonts/space-grotesk/400Regular`. Importing from a package root
pulls in every weight and italic it ships — 29 files and close to 4MB for the
ten faces this app uses.

Bengali is applied automatically, not by hand. `src/lib/bengali.ts` detects the
script and `AppText` swaps the family, so `<AppText>রক্তমুখী নীলা</AppText>`
renders correctly wherever it appears. A mixed string is treated as Bengali:
one `Text` gets one family, and the Bengali family can draw both.

## Tokens

`src/theme/tokens.ts` and `src/theme/typography.ts` hold the whole design
system — colours, the five-step escalation heat scale, radii, spacing, layout
constants and the type scale. Nothing anywhere else in the app writes a hex
value or a pixel size that appears in those two files.

Two radii were read off the prototype rather than the handoff, which does not
distinguish them: compact buttons (Nudge now, Approve) are 8px, full-width
primary buttons (Assign, Mark done) are 12px.

## Firebase and the session

- `src/lib/firebase.ts` — Auth with AsyncStorage persistence, so the team is not
  asked to sign in again every morning, and Firestore with long-polling
  auto-detection, because a board that silently stops updating is worse than
  one that polls.
- `src/lib/auth.tsx` — `SessionProvider` / `useSession`. Role and status come
  off the ID token's **custom claims**, never from the user document. It also
  watches the signed-in user's own document, and when that document moves ahead
  of the token — an approval — it forces a token refresh. That is what makes
  the holding screen unlock without a sign-out.
- `src/lib/google-sign-in.ts` — native Google sign-in, plus a development-only
  emulator path.

Configuration comes from `EXPO_PUBLIC_*` variables; copy `.env.example` to
`.env`. These are public identifiers, not secrets — the security boundary is
the Firestore rules and the claims.

### Running against the emulators

Native Google sign-in needs a development build; it is not available in Expo Go.
For local work, start the emulators from the repository root and set
`EXPO_PUBLIC_USE_EMULATORS=1` — the sign-in screen then offers an emulator
sign-in as the owner. That path is gated on `__DEV__` as well as the flag, so it
cannot reach a release build.

```bash
npm run emulators          # repository root
cd mobile && npm start
```

## Routing

```
app/_layout.tsx    fonts, SessionProvider, splash
app/index.tsx      the gate
app/sign-in.tsx    Google sign-in
app/pending.tsx    ─┐
app/board.tsx       ├─ placeholders, replaced in steps 3–7
app/my-tasks.tsx   ─┘
```

The gate has three destinations, decided by the claims: not signed in →
sign-in; pending → the holding screen; approved → the board for an admin, their
own task list for a member.

`ScreenHeader` is built to the specification — ink bar, 40px mark, 16px/600
title, 11px monospace subtitle, yellow-outlined Back pill — because every one of
the nine screens wears it. The screen bodies are placeholders that print the
live session claims, which is how the whole stack gets checked on a device
before anything is drawn on top of it.

## Builds

`eas.json` carries three profiles:

```bash
npm run build:dev          # APK, dev client, internal distribution
npm run build:preview      # APK, internal distribution
npm run build:production   # AAB for Play, autoIncrement
```

Before the first build: `npm install -g eas-cli`, then `eas init` (fills
`EAS_PROJECT_ID`), and download
`google-services.json` from the Firebase console into `mobile/`. It is not in
the repository — it is per-project, and EAS supplies it as a secret file at
build time. `app.config.ts` wires it up only if it is present, so `expo
prebuild` works without it today.

## Verified

- `tsc --noEmit` clean.
- `npx expo-doctor` 21/21.
- `npx expo export --platform android` produces a 4.4MB bundle: every import
  resolves, Firebase included.
- `npx expo prebuild` generates `applicationId com.kahiniscope.production`,
  the adaptive icon with its monochrome layer, `splashscreen_background
  #f7f5f0` and `colorPrimary #ffc20a`. The generated `android/` directory is
  not kept — EAS regenerates it at build time.
- 5 unit tests on the Bengali detection, including the three sample episode
  titles.

Not verified: nothing has run on an Android device yet. That needs `npm run
build:dev` and a real phone, which is also where Google sign-in gets its first
real test.
