# Implement.md

**Project:** Elyx Resource Allocator (see PROJECT.md, DECISIONS.md, GLOSSARY.md)
**Updated:** 2026-05-30 (iteration 2)

---

## Architecture

Client-side React SPA (Vite + React 19 + Tailwind v4), deployed on Vercel. No
backend for v0.1. Data flows:

```
src/data/*.csv (static)
   → src/lib/csv.js (parse)
   → src/lib/actionPlanCsv.js / src/lib/constraintsCsv.js (row ↔ domain)
   → src/lib/schemas.js (Zod validation, source of truth)
   → src/lib/validate.js (referential integrity)
   → src/scheduler/* (pure functions)
   → src/lib/loadData.js (Vite ?raw CSV imports → parse → validate → schedule)
   → src/components/* + src/ui/* (React + Tailwind calendar UI)
```

## UI (src/components/, src/ui/) — built

Single-screen calendar app (taste-skill dials VARIANCE 3 / MOTION 3 / DENSITY 6
— product UI, not a landing page). Day / Week / Month views.

- `lib/loadData.js` — `loadData()` parses + validates the CSVs once (no
  scheduling); the app re-runs `schedule()` reactively when the policy changes.
  `loadAll(opts)` is a convenience that loads + schedules in one call.
- `ui/aggregate.js` — pure view-model layer: `splitPlan` (events vs routines),
  `dedupeDay` (collapse same-activity repeats → ×N), `buildDailyProtocol` (group
  routines by type, deduped, excludes guidelines), `groupSkippedByReason` (group
  skips by reason + plain-language label/explanation), `buildGuidelines`,
  `tagEventsForMonth`.
- `ui/encoding.js` — type hues (Color Lock), labels, time/day/`rangeLabel`.
- `ui/icons.jsx` — Phosphor per type (deep `dist/csr/<Icon>` imports).
- `ui/useTheme.js` — light/dark, system-default, persisted.
- `components/Topbar` — title + ViewSwitcher + range nav (clamped) + theme.
- `components/ViewSwitcher` — segmented Day/Week/Month.
- `components/SummaryStrip` — scheduled / substituted / skipped counts.
- `components/Legend` — fixed activity-type color key.
- `components/WeekGrid` — 7 columns of DEDUPED EVENTS, each split into
  Morning / Afternoon / Evening bands (empty bands show "Open").
- `components/DayView` — single-day event agenda.
- `components/MonthGrid` — month overview, event count + type dots per day,
  click drills into Day.
- `components/DailyProtocol` — the **Self-care** panel (member-performed items,
  no booked person/venue), accordion-by-type, collapsed by default + colored
  icon chips (D35/D44).
- `components/WorkloadControls` — live sliders for `maxEventsPerDay` +
  `eventBufferMin` (right column, above the SidePanel); the thumb tracks
  instantly while the full re-solve is debounced (200ms) so dragging stays
  smooth (D41).
- `components/GuidelinesPanel` — standing dietary/lifestyle principles
  (track='guideline'), shown for reference, never scheduled.
- `components/ActivityBlock` — one event; type color, ×N badge, dashed backup,
  remote icon.
- `components/SidePanel` — selected-instance detail + skipped grouped BY REASON
  (collapsible, plain-language label/explanation, decision D34).
- `App.jsx` — loads, splits events/routines, drives view mode + anchor + range.

Result: the 90-card Monday wall becomes ~26 deduped event cards on the calendar
+ a Daily Routine panel (53 routine items grouped by type) + a grouped skipped
list. Build ~470 KB JS (gzip ~123 KB), dominated by bundled CSV data.

## Scheduler (src/scheduler/) — built

Pure, framework-free modules; `src/` never imports `scripts/`.

- `intervals.js` — tz-free ISO datetime math; half-open `overlaps`, `contains`,
  `eachDay`, `weekday`, `isoAtMinutes`, `addMinutes`.
- `classify.js` — `isEvent`: RESOURCE-BINDING (facilitator != self OR venue in
  {gym, clinic}), cadence-independent (D43). Events contend for slots + count
  against the cap; self-care (member-performed, no scarce resource) never does,
  at ANY frequency — so a self-administered med is never wrongly capped.
- `config.js` — MAX_EVENTS_PER_DAY (6), EVENT_BUFFER_MIN (30), day window, grid.
- `resourceIndex.js` — day-bucketed lookups; member booking (capacity 1, events
  only), event buffer + per-day count, equipment/provider booking, role-based
  substitution.
- `slots.js` — `targetPlacements` → `{day, anchorMin}` (multi-instance/day spread
  to morning/noon/evening, per-activity jitter so activities fan out);
  `candidateMinutesFrom` searches outward from the anchor; `DURATION_MIN`.
- `schedule.js` — engine: classify event vs routine; events occupy the member
  exclusively + buffered + capped; routines are spread checklist items that do
  not contend; book → backup fallback → skip with reason. `effectiveUntil` is an
  exclusive midnight boundary. Takes `opts` ({maxEventsPerDay, eventBufferMin})
  so the UI can re-solve live (D41).
- `index.js` — `deriveHorizon`, `filterToRange`, `groupByDay`, `weekRange`.

Real-data run (full 3-month horizon): 5884 instances — 4869 primary, 565 backup,
450 skipped. Invariants tested: member never double-booked, events never overlap
+ stay under the daily cap, no provider/equipment double-booking, validity
respected, substitution fires. Week-1 Monday: ~14 events (was 100 stacked at
05:00 before the member-capacity fix).

## Modules built

- `src/lib/schemas.js` — Zod schemas (Pydantic-equivalent). Activity (16 fields,
  incl. validity window), ReasonedWindow, the 5 Constraints (resources carry
  `availability` + reasoned `downtime`; client schedule has `kind`), Constraints
  bundle, ScheduledInstance / PersonalizedPlan output.
- `src/lib/csv.js` — dependency-free RFC-4180 `toCsv` / `parseCsv`.
- `src/lib/actionPlanCsv.js` — Activity ↔ flat CSV row (incl. effectiveFrom/Until).
  `loadActivities` is the graceful-degradation loader: skips malformed rows and
  collects per-row errors instead of throwing (for messy/real uploads).
- `src/lib/constraintsCsv.js` — Constraints ↔ NORMALIZED CSVs (resources,
  resource_windows, client_schedule, travel). Symmetric round-trip, Zod-validated.
- `src/lib/validate.js` — `validateReferences(actionPlan, constraints)`:
  referential integrity (equipment ids, pinned facilitators, role satisfiability).
- `src/lib/sampler.js` — provider-agnostic (BYOK) LLM sampler (action-plan data
  source; runtime BYOK adapter is backlog).
- `scripts/resourceBank.js` — closed bank: EQUIPMENT (12), SPECIALISTS (5),
  ALLIED_HEALTH (9; 2 trainers + 2 physios for substitution), ROLES,
  `canonicalizeRole`. Single source of truth for ids/roles + weekly patterns.
- `scripts/transformActionPlan.js` — role canonicalization, role-based de-pinning
  (CONTINUITY_PINS keep resourceId), validity windows (VALIDITY), 2 hard activities.
- `scripts/availabilityData.js` — pure deterministic availability generator
  (`generateConstraints`).
- `scripts/runAggregateActionPlan.js` — runner: batches → transform → validate →
  CSV (`bun run gen:action-plan`).
- `scripts/runGenerateAvailability.js` — runner: generate → validate → normalized
  CSVs (`bun run gen:availability`).

Naming: pure-logic modules are camelCase nouns; runnable entry scripts use a
`run`-prefix (runAggregateActionPlan, runGenerateAvailability) to separate
side-effecting entry points from importable/testable logic.

## Data conventions

- **Resource pools** publish AVAILABLE windows + reasoned `downtime`.
- **Member context** (Client's Schedule, Travel) publishes BLOCKED windows;
  client entries tagged `commitment`|`incident`.
- **Closed world / role-based:** scheduler picks any available provider of the
  required role; `resourceId` pins only for continuity. Resource-level
  substitution precedes activity `backups`.
- **Id namespace:** `act-NNN`, `eq-NN`, `sp-NN`, `ah-NN`.
- Datetimes local ISO-8601; horizon 2026-06-01..2026-08-31.

## Datasets — done

- `src/data/action_plan.csv`: **104 activities** (97 scheduled + 7 guideline).
  Supplements consolidated to AM/PM stacks (D32); dietary principles are
  guidelines (D33). Daily routines dropped from 35 → ~20.
- Constraints (normalized CSVs): 12 equipment, 5 specialists, 9 allied health,
  1508 resource windows, 161 client-schedule entries, 3 travel trips. Validated;
  all action-plan references satisfiable.
- `src/data/messy_sample.csv`: **QUARANTINED** robustness fixture (clean rows +
  injected bad types / missing fields / invalid enums / dangling refs). Never
  loaded by the app; used only by tests (and a future demo toggle) to prove
  `loadActivities` degrades gracefully. Regenerate: `bun run gen:messy`.

Data realism note: priority values are intentionally clustered/tied (1–10, peak
mid-range), not a strict 1..N ranking — mirrors how a care team tiers importance.
Row order in the CSV is cosmetic; the scheduler re-sorts on load.

## Scheduler design (planned, not yet built)

Priority walk → for each activity compute required instances over the horizon →
generate candidate slots → check ALL constraints simultaneously (member free,
not travel-blocked unless remote, facilitator free, equipment free, prep
satisfiable) → place greedily, mark resources busy → on failure try backups, else
apply skip-adjustment → attach metrics. Index constraints into fast lookups to
keep placement near-linear.

## Commands

- `bun run dev` / `bun run build` / `bun run preview`
- `bun test` (127 tests passing; every suite follows the 3-3-3 rule)
- `bun run format` (Prettier: 2-space, 80-col, single-quote, trailing commas)
- `bun run lint` (ESLint, clean)
- `bun run dev` / `bun run build` (Vite)
- `bun run format` (Prettier: 2-space, 80-col, single-quote, trailing commas)
- `bun run gen:action-plan` (regenerate action_plan.csv from batches)
- `bun run gen:availability` (regenerate constraint CSVs)
- `bun run gen:messy` (regenerate the quarantined messy_sample.csv)


## Live LLM sampler (v0.2 — feat/llm-sampler) — built

On-demand action-plan generation, layered onto the existing static-CSV app.

```
WelcomePage (first visit)
  ├─ "Use our sample data"  → loadData() (bundled CSVs, instant)
  └─ "Sample new data"      → requestSampledActionPlan() (browser)
          → POST /api/sample (Vercel serverless, holds GROQ_API_KEY)
          → makeGroqInvoke → sampleActionPlan({ invokeLLM, config })  [Zod-validated]
          → buildData(activities)  (reuses the BUNDLED constraints; D47)
          → schedule(...)  (same engine, same horizon)
```

- `api/sample.js` — Vercel serverless function (Node). Holds `GROQ_API_KEY` as
  an env var (D48), calls Groq's OpenAI-compatible chat-completions endpoint
  (`llama-3.3-70b-versatile` default, override via `GROQ_MODEL`), and runs the
  result through the existing `sampleActionPlan` so output is Zod-validated.
  Clamps `activityCount` to [100, 140]. Returns `{ actionPlan, model }`.
- `src/lib/sampleClient.js` — browser → `/api/sample` POST helper; throws on
  failure so the caller can fall back (D50).
- `src/lib/loadData.js` — factored into `buildData(activities, loadErrors)`
  (constraints memoized + bank summary) so the static loader and the sampler
  share one path; the sampler swaps the action plan, keeps the deterministic
  3-month constraints (D47).
- `src/lib/sampler.js` — rewrote the action-plan prompt to the REAL 13-field
  schema (dropped the stale `requiredEquipment`/`track` from D36) and baked in
  every resolved lesson: resource-binding classification (D43), supplement
  consolidation (D32), name-led `details` (D45), clustered priorities, venue-
  level equipment. Mirrors the bank ids/roles as prompt text (`BANK_REFERENCE`,
  `BANK_ROLES`) since `src/` may not import `scripts/` (D49). `extractJson` gained
  a `jsonrepair` third-tier fallback (D50).
- `src/ui/aggregate.js` — `buildBankSummary(constraints)`: pure transform that
  groups the loaded bank into care-team-by-role (+ remote flag) and venues, for
  the welcome page's read-only context. Derived from the loaded CSVs (no
  `scripts/` import).
- `src/components/WelcomePage.jsx` — intro + 3-step how-to + customizable
  count/type-mix sliders + read-only bank panel + two action buttons. Zinc/teal
  locks, Phosphor duotone icons, product-UI dials (D20).
- `src/App.jsx` — split into `App` (data-source gate: welcome → bundled or
  sampled, with graceful fallback + notice) and `CalendarApp` (the workspace).
  Topbar gained an optional `New plan` button to return to the sampler.

Config: `.env.example` (committed) documents `GROQ_API_KEY`/`GROQ_MODEL`; `.env`
is git-ignored. `vercel.json` pins `bun run build` + SPA rewrites that exclude
`/api`. ESLint: Node-globals override for `api/**` + `scripts/**`.

Tests: 127 → 136 (added a 3-3-3 `buildBankSummary` suite; strengthened sampler
tests for the bank reference + jsonrepair). Lint clean, build OK.