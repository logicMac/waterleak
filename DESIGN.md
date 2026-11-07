# LeakGuard — design system

Mode: **Operate** (monitoring dashboard, quick-glance + control). Style: framed-sheet — white cards
with 1px borders and faint shadow on a soft slate ground; dark mode on deep navy per brief.

## Tokens

| Role | Light | Dark |
|---|---|---|
| ground | #F1F5F9 (slate-100) | #0B1220 |
| surface | #FFFFFF | #0F172A (navy, brief) |
| border | #E2E8F0 | #1E293B |
| rule (row) | #F1F5F9 | #162033 |
| text | #0F172A | #F1F5F9 |
| muted | #64748B | #94A3B8 |
| accent (data + 1 primary) | #0EA5E9 | #38BDF8 |
| accent-2 (zone 2 series) | #64748B | #7C8DA6 |
| positive | #15803D / pill #DCFCE7 #14532D | #4ADE80 / pill #052E16 |
| warning | #B45309 / pill #FEF3C7 #92400E | #FBBF24 / pill #451A03 |
| negative | #DC2626 / pill #FEE2E2 #991B1B | #F87171 / pill #450A0A |

- Font: Poppins (300/400/500/600/700), `fontFamily.sans`. Tabular figures via `font-variant-numeric` on all figures.
- Radius: cards 14px, controls 10px, chips full. One shadow: `0 1px 3px rgb(15 23 42/.06)` on resting cards; menus/modals get real drop shadows.
- Type scale: 12/14/16/24/30. h1 = 24/600. KPI values 24–30. Card titles 14–15/600.

## Decisions

- **Signature element:** twin zone cards (live L/min, cumulative L, NORMAL/TRIPPED badge) — the product's own object. Tripped = red border + soft pulse (alarm state, brief-mandated) + icon + text.
- **One hue on data:** Zone 1 = #0EA5E9, Zone 2 = slate. Status colors never on data.
- **Sidebar:** labelled, 240px, grey pill active state, folds to a 5-item bottom tab bar + "More" sheet on mobile.
- **Tables:** no zebra, no header band, numbers right-aligned tabular, grey sentence-case headers.
- **Stale data:** when device offline, live figures go grey + italic "offline — last seen …" and are never presented as live.
- **States:** skeleton bars at real sizes, empty states keep the card frame, errors inline with Retry, connection-lost banner top.
- Buttons: one filled primary (accent blue); secondary = white/dark outline. Controls 36px, inputs 40px. Focus ring 2px accent offset. `prefers-reduced-motion` kills pulse/transitions.
