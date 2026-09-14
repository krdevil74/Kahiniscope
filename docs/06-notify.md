# Step 6 — Notify, and the owner-only gate

Four sections: who may do what, how reminders get out, how hard they chase, and
when they stay quiet. Three of the four belong to the owner alone.

```bash
npm run test:roles      # promotion, demotion, and the settings only the owner may write
```

---

## The gate

The security rules and the callable enforce this independently of the screen:

| | Admin sees | Admin can change | Owner can change |
| --- | --- | --- | --- |
| Master admin card | yes | — | — |
| Make admin / Demote | **hidden** | no | yes |
| Delivery channel toggles | yes, disabled | no | yes |
| Escalation schedule | **hidden** | no | yes |
| Quiet hours | yes, disabled | no | yes |

An admin still *reads* the channels and the quiet window, because every
countdown in the app is computed from the same document and hiding it would
make the board unexplainable. What they cannot do is write it —
`allow write: if isOwner()` on `settings/global`, and `setMemberRole` refuses
any caller whose claim is not `owner`.

`setMemberRole` exists rather than a direct write because it enforces three
things rules cannot: it will not mint a second owner, it will not promote
somebody who has not been approved, and on demotion it **revokes the refresh
tokens immediately** rather than letting an hour-old admin token run itself
out.

## The owner's address is not in the bundle

The master admin card shows `owner@kahiniscope.example`, but that string is never
compiled into the app. It is read from the owner's own user document — the
account whose `role` is `owner` — which is written by the Cloud Function that
holds the constant. The app displays what the backend decided; it has no way of
knowing the address in advance, which is the point.

## A contradiction in the handoff, resolved

The handoff states the fallback chain twice, differently:

- The escalation engine (§ Channel fallback chain): **push → Telegram →
  WhatsApp → SMS**, with the reasoning — push is free and instant, Telegram is
  free and unlimited, WhatsApp costs money and needs an approved template, SMS
  is one message a day.
- The Notify screen copy: *"channels are tried in order, falling through
  WhatsApp → Telegram → SMS"*.

Both cannot be true, and UI copy that lies about behaviour is worse than either
order. **The engine's order wins**, because it is the normative specification
and the cheaper chain. Two consequences on this screen:

1. **Push has a card.** The design draws four channels; the data model carries
   five. Push is the first rung of the chain and it now says so.
2. **The status tags are derived, not fixed.** "Primary", "Fallback" and "Last
   resort" are computed from the chain order *and* from which channels are
   switched on. Turn push off and Telegram becomes Primary. Turn SMS off — as
   the default settings do — and WhatsApp becomes the Last resort. A screen
   that says "Primary" now names the channel that would really go first.

The closing sentence is generated the same way, so it can never drift from the
toggles above it. With everything off it says so plainly rather than showing an
order that will not happen.

If you would rather have WhatsApp first, change the order in
`src/lib/channels.ts` and `src/lib/channel-meta.ts` — the tags, the sentence and
the Team screen's channel column all follow from it.

## Test send

Drawn, because the design draws it, and honest: tapping it says the channel
chain arrives in build-order step 8. Nothing pretends a message went out.

## Verified

`npm run test:roles` — six tests through the emulators, checking what a token
can actually **do** after each change rather than what the callable returned:

- the owner promotes a member and the new admin can immediately work the
  approval queue — a query that was refused a moment earlier;
- demoting takes it back, and the revoked session cannot read the team;
- an admin cannot promote anybody, themselves included, by callable **or** by
  direct write;
- a pending registration cannot be made an admin;
- there is no second owner, and the owner cannot demote themselves;
- an admin reads `settings/global` but is refused the plan, the channels and
  the quiet hours; the owner is not.

Plus **8 new unit tests** (72 in `mobile/`) on the derived tags and the chain
sentence, including one channel on, and every channel off. The screen
static-renders with the derived tags correct for the default settings —
WhatsApp shows "Last resort" because SMS ships off.

Not verified on a device: the toggles animate and the steppers are 26px
controls with hit slop, which is a thumb's judgement, not a renderer's.
