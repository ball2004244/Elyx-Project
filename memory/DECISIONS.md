# DECISIONS.md

Human-agent agreement. Append/condense as decisions change.
**Date:** 2026-05-30 · **Status:** v0.2

> IDs are stable anchors (some cited in code comments). Superseded ones are
> noted inline (e.g. D30→D43, D10/D11→D36). Format: `Dn — decision — why`.

---

## Foundation & hosting (D1–D8)

- **D1–D7** — React + JS + Tailwind, **bun**, **Vercel**, **client-side**
  scheduler, **single-member**, **readable calendar** output, **static CSV**
  bundled in repo (Supabase deferred). Assignment needs data + scheduler +
  readable output, no backend.
- **D8** — Scheduler runs the **full 3-month horizon**; UI is Day/Week/Month
  (the "1-week v0.1 window" was superseded by D29). Monthly/yearly activities
  only appear over the full horizon.

## Activity data model (D9, D32, D36, D45)

- **D36** — **Activity = 13 fields** (10 assignment + `id`/`priority`/
  `priorityRationale`). D10/D11's `requiredEquipment`/`track`/validity windows
  (→16) were dropped for KISS; equipment is now a **venue-level** constraint
  from `location`. `priorityRationale` is UI/traceability only.
- **D9** — Sample action plan is generated + **Zod-validated**; priority fields
  produced as if by HealthSpan AI. Prompts are a required submission artifact.
- **D32** — Supplements **consolidated** into AM/PM stacks; dose-sensitive
  prescriptions stay separate. 17 pill tasks was unrealistic.
- **D45** — `details` **leads with a name**; `shortLabel` extracts it, full text
  on hover. Fixed at the data source, not the output CSV.

## World model & data integrity (D12–D16)

- **D13** — **Closed-world bank** + role-based selection + resource-level
  substitution ("pick best available from the bank").
- **D14** — Referential integrity via `validateReferences` + defensive
  scheduling + tests; **demo data stays clean** (dangling refs proven via
  synthetic test input, not by dirtying real data).
- **D15/D12/D16** — Availability = **deterministic seeded generator** (not LLM);
  reasoned `downtime` + client-schedule `kind` for explainability; normalized
  constraint CSVs. Hundreds of precise ISO windows are a code job, not an LLM job.

## Scheduler core (D22–D25, D31, D41, D43)

- **D22** — The **member is a capacity-1 resource** (own time booked, nothing
  overlaps). Fixed the 05:00 pile-up.
- **D43** — Classify by **resource-binding**: `isEvent = facilitator != self OR
  venue` (the event/self-care split originated in D23; D43 refined it and
  reverted the cadence rule D30). Events contend for slots + the cap;
  self-care never does, at any frequency — robust to noisy data.
- **D24/D25** — Daily **event cap** (6) + inter-event **buffer** (30 min) +
  anchored spread; overflow → backup → skip.
- **D31** — Weekly distribution **phase-shifted by a per-activity hash** (fixed
  the Monday pile-up; now ~uniform).
- **D41** — `schedule(plan, constraints, range, opts)` takes `maxEventsPerDay`/
  `eventBufferMin`; UI sliders re-solve (debounced 200 ms).

## Calendar UI (D19–D21, D26–D29, D34, D37–D46)

- **D19/D29/D38** — Single-screen app: **Day/Week/Month** switcher, agenda-per-day
  columns, **Morning/Afternoon/Evening bands** + side panel.
- **D20/D21/D42/D46** — Product-UI taste dials; **zinc base + locked teal
  accent**; activity-type hues in blocks; colored icon+text legend; light/dark
  at parity.
- **D26/D27/D44/D28/D35** — **"Self-care" panel** (member-performed, accordion)
  separate from the events calendar; pure `ui/aggregate.js` view-model layer.
- **D34/D40/D39** — **Skipped grouped by reason** with plain-language notes,
  scoped to the visible range; human substitution notes ("Swapped for … — …").
- **D37** — **Dropped the adherence %** (scope-mismatched, not required).

## Process (D17, D18, D33)

- **D17/D18** — **Prettier** (80-col, 2-space, single-quote, trailing commas) +
  the **3-3-3 test rule** (3 happy / 3 hard / 3 edge per suite).
- **D33** — Dietary **principles** fold into routines, not timed tasks (the
  separate `track='guideline'` field was dropped by D36).

## Sampler — v0.2, `feat/sampler` (D47–D57)

- **D47** — First-visit welcome page: **Sample new** OR **Use our data**. Only
  the **action plan** is sampled; availability stays the deterministic bank.
- **D49** — The sampler **references the fixed bank, never invents it**
  (canonical ids/roles), so output always passes referential integrity.
- **D55** — **Random sampler is the live UI path** (`src/lib/randomSampler.js`,
  client-side, instant, key-free); mirrors the bundled CSV's bell-curve priority
  + per-type patterns. The LLM/Groq path (D48 server-side key, D50 graceful
  fallback + `jsonrepair`, D52/D54 per-type bucketed sampling, D53 multi-key
  round-robin on llama-3.3-70b) is **kept but disabled** in `disabled/` — Groq
  free-tier limits made it unreliable for a live demo. (D51: was shipped on a
  branch + preview before this pivot.)
  **PDF note:** "≥100" = action-plan activity count (a floor, met by bundled
  104), NOT bank size; the 26-resource bank is the separate 3-month deliverable.
- **D56** — Per-type content pools expanded to ~20–32 items; overflow appends a
  natural qualifier ("progression block") not "(variant N)". Also: teal calendar
  favicon; Topbar "Start"→icon-only jump-to-start; "New plan" refresh icon;
  welcome-page theme toggle.
- **D57** — QA iter-1 fixes: shared `largestRemainder` (`src/lib/distribute.js`)
  replaces 3 drifting count-split copies + fixes the `total:0`→5 floor bug
  (`total<=0`→zeros); removed unused `papaparse`; relocated orphaned
  `sampleClient.js`→`disabled/`. 172 tests green.
- **D58** — Side panel resolves resource **ids → human names** + shows **venue**:
  the detail view showed raw `facilitatorId`/`equipmentIds` (e.g. `ah-08`) and no
  location. Added pure `buildResourceIndex(constraints)` (`ui/aggregate.js`) →
  `Map<id, {name, role, kind}>`; `App` memoizes it and passes `resourceById` to
  `SidePanel`, which now shows "Daniel Kim · personal trainer", equipment names
  (falls back to the id if unknown), and a **Location** row from
  `activity.location` (Elyx gym/clinic, home, outdoor, video call, restaurant).
  Names/venue already lived in the loaded data, so no schema change.

---

## Standing scope & gate

- **Release gate (hard):** ≥100 activities; 3 months availability for all 5
  constraint nodes; hosted (Vercel) + GitHub link + documented prompts. All met
  by the bundled dataset.
- **Resolved opens:** single-member (O1); static local CSV (O3); Day/Week/Month
  views (O2/O4, superseding the original 1-week scope).
- **Roadmap:** in-app sampler polish; Supabase only if multi-session/member
  needed.
