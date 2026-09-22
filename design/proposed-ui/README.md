# Proposed UI — for review before anything is built

Two preview sheets and the HTML that made them. **Nothing in `mobile/` has
been changed yet.** Open the PNGs, or open `index.html` / `sheet2.html` in a
browser for the crisp version.

## The palette, and the discipline

```
#9B5DE5  purple   the brand. Primary actions, headers, the mark.
#F15BB5  pink     attention. Overdue, sent back, registrations waiting.
#FEE440  yellow   heat. The escalation ladder, and an estimate that is not a promise.
#00BBF9  blue     information. The review queue, a contact match.
#00F5D4  mint     money. Paid, done, earned.
```

Five loud colours used loudly would be worse than what is there now. Each one
is given a job and nothing else, so the screen means something at a glance:
mint is always money, pink is always something wanting attention. Purple and
pink appear together only as the primary-action gradient, which is why that
gradient reads as "the button".

## The base

**Dark** (`#0D0A14`, a near-black with a violet cast). These hues on dark read
as premium; the same hues on white read as a poster, which is the "high
school" quality worth avoiding. A light variant is in sheet 2, fourth frame,
for comparison — it works, but the palette is doing less of the work.

## Type

| | Now | Proposed |
| --- | --- | --- |
| UI | Space Grotesk | **Plus Jakarta Sans** — 400/500/650/750/800 |
| Numbers, meta | IBM Plex Mono | IBM Plex Mono, unchanged |
| Bengali | Noto Sans Bengali | Noto Sans Bengali, unchanged |

Space Grotesk is a display face: its personality fights with a screen of
data. Plus Jakarta Sans is quieter at small sizes and has the weight range
this needs — the current design leans on 600 for everything, which is why
hierarchy reads flat.

The other half of "professional" is not the typeface. It is tighter tracking
on headings, a real weight jump between a title and its meta line, and
monospace kept for things that are actually numbers. All three are in the
previews.

## What is in the sheets

**01** — Board (admin), Payments (member), Tasks (member)
**02** — Review (admin), Access requests (admin), Notifications, Board in light

## Notifications

The third frame of sheet 2. Lock-screen notifications carry the colour of
what happened — mint for money, pink for work coming back — and the in-app
toast is the primary gradient. Both were plain text before.
