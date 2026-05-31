# DECISIONS.md

Human-agent agreement. Captured before implementation. Update when a decision changes.

**Date:** 2026-05-30
**Status:** v0.1 - agreed

---

## Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Language / framework | React + JavaScript + Tailwind | Per AGENTS.md. |
| D2 | Package manager / runtime | bun | Per AGENTS.md (always bun). |
| D3 | Hosting | Vercel | Satisfies the hard "host on the internet" requirement; first-class React support. |
| D4 | Data layer | Static CSV sampled locally, bundled in repo (Supabase deferred) | Simplicity. The assignment only needs sample data + a scheduler + readable output; a backend is not required to demonstrate the logic. |
| D5 | Compute location | Scheduler runs client-side in the browser | No server needed; keeps Vercel deploy as a static/SPA build, lowest hosting friction. |
| D6 | Output format | Readable calendar view (React + Tailwind) | Assignment: no polished UI needed, but output must be calendar-readable. |
| D7 | App shape | Single-member app | Per agreement; richer per-member data, simpler model for v0.1. |
| D8 | v0.1 view/scheduling window | 1 week (weekly grid + daily detail) | Fast to build and demo; full 3-month data still generated for the release gate. |
| D9 | Sample-data source | LLM sampler (prompts in `src/prompts/sampler.md`), output validated against Zod schemas | We use an LLM to generate realistic Elyx data; the member's `priority` + `priorityRationale` are produced as if by HealthSpan AI. Prompts are a required submission artifact. |
| D10 | Activity field count | 14 fields (10 assignment + id, priority, priorityRationale, requiredEquipment) | priorityRationale (field 14) added for evidence/traceability, matching Elyx's evidence-backed positioning; read by UI only, never by the scheduler. |
| D11 | Activity validity window | Add optional `effectiveFrom`/`effectiveUntil` (fields 15-16; null = whole horizon) → 16 fields | Lets a minority of activities be short-lived phases (rehab/kickstart) rather than all permanent habits; needed for realistic non-persistent intervals. |
| D12 | Explainable disruptions | Reasoned `downtime` on resources + `kind` (commitment/incident) on client schedule | Makes the scheduler's adaptations explainable in the UI ("moved: trainer on leave"), on-brand for Elyx traceability. |
| D13 | World model | Closed-world bank + role-based selection + resource-level substitution | "Pick best available from the bank." More realistic for a multi-provider concierge; substitution adds scheduling intelligence. New resources/types/open-world deferred. |
| D14 | Referential integrity | Validator (`validateReferences`) + defensive scheduling + tests; demo data stays clean | Dangling refs handled gracefully (treated as unavailable) and proven by tests with synthetic broken input, NOT by dirtying the dataset shown to reviewers. |
| D15 | Availability data source | Deterministic seeded generator (not LLM) | Hundreds of precise non-overlapping ISO windows are what code does perfectly and LLMs do unreliably; reproducible + testable. Realism (downtime/incidents/travel) injected deliberately. |
| D16 | Constraints CSV layout | Normalized: resources.csv + resource_windows.csv + client_schedule.csv + travel.csv | Avoids duplicating resource metadata across many window rows (DRY); reads like DB tables. |
| D17 | Formatting | Prettier (printWidth 80, 2-space, single-quote, trailing commas, always arrow parens); `bun run format` | Enforces CodeStyle.md mechanically and deterministically rather than by hand. Prompt-content strings and test-name strings may exceed 80 (content, not code). |
| D18 | Test coverage policy | >=5 cases per function (typical/edge/error) per CodeStyle.md | Added direct unit tests for csv, validate, transformActionPlan/canonicalizeRole. |
| D19 | Calendar UI shape | Single-screen app: week grid (agenda-per-day columns) + side panel for skipped/day detail | Assignment wants a readable calendar; skipped instances have no slot so they need a panel. Agenda-per-day avoids empty hour-row whitespace vs a time-grid. |
| D20 | UI dials (taste-skill) | VARIANCE 3 / MOTION 3 / DENSITY 6 — product UI, not a landing page | taste-skill Section 13: calendars are product UI. Apply only its universal rules (type, consistency locks, dark mode, a11y, icons, motivated motion); skip landing-page devices. |
| D21 | UI palette/encoding | Neutral zinc base + single locked accent (teal); activity types get fixed hues inside blocks; kind (primary/backup/skipped) shown by treatment not new hues | Color Consistency Lock + clear semantic encoding of the scheduler's explainability output. |
| D22 | Member is a capacity-1 resource | Scheduler books the member's own time; nothing overlaps for the member | Fixes the 05:00 pile-up bug: self/no-equipment activities were never reserving member time, so 50+ stacked on the first free slot. |
| D23 | Event vs routine split (scheduler) | `isEvent` = facilitator != self OR venue in {Elyx gym, Elyx clinic}. Events get slots, spacing, and the daily cap; routines (self + home/outdoor) are spread but uncapped/unbuffered | Caps/spacing must NOT skip meals/meds. Only resource/venue-bound events belong on a contended calendar. Derived, no schema change. |
| D24 | Daily workload cap | `MAX_EVENTS_PER_DAY` (default 6) applies to EVENTS only; overflow → backup → skip with reason 'daily-cap-reached' | Realistic member workload; priority order fills the cap with the most important events first. |
| D25 | Inter-event buffer + spread | `EVENT_BUFFER_MIN` (default 30) min gap between consecutive events; multi-instance activities seeded from spread anchors (daily n/day → morning/noon/evening) | Prevents back-to-back stacking and the all-at-05:00 collapse; meals land across the day. |
| D26 | Routine display | Single "Daily Routine" panel (option b), shown once — NOT repeated per day column | A longevity Daily Routine is largely constant Mon-Sun; showing 53 routines once (grouped by type) + per-day events on the calendar is far more readable than 53 rows x 7 days. |
| D27 | Calendar shows events only | Week/Day calendar renders EVENTS (resource/venue-bound); routines live in the Daily Routine panel | Events are what vary day to day and need slots; routines are checklist items. Splits the 90-card wall into ~26 event cards + 1 protocol panel. |
| D28 | Aggregation layer | Pure `src/ui/aggregate.js`: splitPlan, dedupeDay (collapse same activity same day → xN), buildDailyProtocol (group routines by type), groupSkipped (dedupe skipped by activity + count) | Keeps components dumb; all view-model transforms are pure + unit-tested (3-3-3). Fixes the un-deduped skipped list too. |
| D29 | Views | Day / Week / Month switcher (segmented control); Month = overview of event counts per day | User expected view switching; pulled forward from backlog. Week stays the default. |
| D30 | Event classification refined | `isEvent` = (facilitator != self OR venue) AND period != 'day'. Daily-cadence items are ALWAYS routines | Fixed act-062 (photo-log meals 3x/day, nominal "health coach") being capped as an event → 69 false skips. Daily cadence is routine by nature; you don't book a coach to photograph lunch. |
| D31 | Uniform weekly distribution | `spreadDays` phase-shifted by a per-activity hash so weekly/monthly activities scatter across all 7 days | Fixed Monday pile-up (308 events) — the old spread always started day-picking at index 0 (Monday). Now ~uniform: busiest weekday < 35% of events. |
| D32 | Supplement consolidation | Merge 12 individual daily supplements into 2 activities (AM/PM stacks); keep 5 dose-sensitive prescriptions separate (statin, metformin, lisinopril, aspirin, berberine) | 17 separate daily supplement tasks was UX-hostile and unrealistic — a member opens a pill organizer twice, not 17 reminders. Drops daily routines 35→~20 (realistic). 114→104 activities (above gate). |
| D33 | Guideline track | Add `Activity.track` ('scheduled' \| 'guideline'); dietary principles (sugar cap, olive oil, meal timing, fiber, Mediterranean pattern, ultra-processed cap, alcohol cap) are guidelines — shown in a panel, NOT scheduled (no instances) | These are standing constraints, not timed tasks; scheduling them inflated the daily count with things that don't belong on a clock. |
| D34 | Skipped grouped by reason | Side panel groups skips by REASON (traveling / no-provider / daily-cap / equipment / member-busy) with plain-language explanations, collapsible | "Grouped by activity" answered which but not why; by-reason answers "why so many" and reframes skips as understandable adaptation, not failure. |
| D35 | Daily Routine accordion | Collapsible-by-type, collapsed by default, summary chips | 59 rows at once is overwhelming; one summary line expanding on demand fits the taste-skill "long lists need a different component" rule. |
| D36 | KISS: drop the 4 extension fields | Remove `requiredEquipment`, `track`, `effectiveFrom`, `effectiveUntil`. Keep the assignment's 10 + `id`/`priority`/`priorityRationale` (13 cols). | Simpler model, less overwhelming UI. Equipment → venue-level constraint derived from `location`; guidelines fold into routines; no phases (the spec has none). Core scheduler + event/routine split + all views survive on the original fields. Supplement consolidation (D32) is kept (uses only core fields). |
| D37 | Drop the adherence % | Remove the adherence metric from the summary strip | It was scope-mismatched (windowed events vs whole-horizon skips, routines excluded) and "skipped" is a planning outcome not member behavior, so calling it adherence overclaimed. The assignment does not require it. Real adherence (completion events) is a future feature. |
| D38 | Day-part bands | Render each day column in Morning / Afternoon / Evening bands | Gives a sense of daily rhythm and free time without the dead whitespace of a full hour-grid (keeps the agenda-per-day density advantage from D19). |
| D39 | Human substitution notes | Scheduler emits structured `reason` + `backupId`; UI formats "Swapped for {backup details} — {plain reason}" | The old note exposed a raw id + code ("Substituted with act-024 (venue-unavailable)") which is meaningless to a user. |
| D40 | Scope skips + summary to the view | Skipped instances carry their intended `day`; the summary strip and skipped panel filter to the selected day/week/month | Showing whole-horizon skip totals on a single-day/week view was misleading; counts now match what the user is looking at. |
| D41 | Live scheduler controls | `schedule(plan, constraints, range, opts)` takes `maxEventsPerDay` + `eventBufferMin`; UI sliders re-run the scheduler. Slider thumb tracks instantly (local draft) while the full re-solve is DEBOUNCED 200ms; controls live in the right column with the skipped panel. | Lets the user watch the constraint solver respond live without lag — dragging updates the value smoothly, the expensive re-solve fires once on pause. |
| D42 | Legend: colored text + icon (no dots) | Legend, month cells, and protocol chips use the type's colored icon + label; removed the `dot` swatch | A dot alone isn't decodable (color-blind, 5 muted hues); colored icon+text matches the calendar blocks and is accessible. |
| D43 | Classify by RESOURCE-BINDING, not cadence | `isEvent = facilitator != self OR venue location`; dropped the `period !== 'day'` clause (reverts D30) | Robust to noisy data: a self-administered med is never an event at ANY frequency (never wrongly capped/skipped), while a provider/venue activity is an event at any frequency. Cadence was a brittle proxy. The photo-log that triggered D30 is fixed at the data level instead. |
| D44 | Rename "Daily Routine" → "Self-care" | The non-resource-bound panel | Under resource-binding the panel holds non-daily items too (weekly self workout, monthly self-supplement), so "Daily Routine" was misleading. "Self-care" = member-performed, no booking. |
| D45 | `details` leads with a name; short labels everywhere | Author each activity's `details` so the first clause is its NAME (use a "Name: full guidance" shape when the text is an imperative guideline); `shortLabel` extracts it and the full text is the hover tooltip. Applied to the calendar (`ActivityBlock`) too, so calendar + Self-care + Skipped all show short labels | `shortLabel` only reads well when `details` leads with the activity name; ~18 food rules were imperatives ("When dining out, order...") so their first clause was a fragment. Fixed at the data source (batch JSON, then regenerate), never in the output CSV. |
| D46 | Light-mode activity-type colors at parity with dark | `TYPE_STYLE` light blocks: fill `-50 → -100` (visible tint), label `-900 → -800` (still WCAG AA over the fill but visibly the type's hue), ring kept `-200`. Dark mode unchanged | Light mode washed out: `bg-sky-50` was barely a tint and `text-sky-900` read as near-black, so the five types collapsed into near-white black-text cards and lost their color identity. `-100/-800` matches the app's other light tints (one palette). |

---

## Data strategy detail (D4)

- v0.1: ship generated sample data as **static CSV** files (sampled locally) in the repo (`/data` or `/public`), loaded at runtime. No in-app upload yet.
- Data generation still produces the full **>=100 activities** and **3-month** availability (release gate), even though v0.1 schedules/renders a 1-week window.
- Supabase is deferred. Revisit only if we need persistence, multi-user, or auth. Not needed to satisfy the assignment.

## Scope guardrails

- Generate >=100 activities and 3 months of availability for all constraint nodes (Client's Schedule, Travel, Equipment, Specialists, Allied Health).
- Deliverables: hosted Vercel URL + public GitHub repo + documented AI prompts.

## Resolved (2026-05-30)

| # | Question | Resolution |
|---|----------|------------|
| O1 | Single vs multiple members | **Single-member app** for v0.1. |
| O2 | Calendar granularity | **Weekly grid + daily detail** for v0.1. |
| O3 | Static vs in-app upload | **Static CSV, sampled locally**, bundled in repo. |
| O4 | Scheduling/view window | **1 week** for v0.1. |

## Release gate (assignment hard requirements)

The assignment will not be reviewed unless these are met by final submission:
- **>=100 activities** in the action plan.
- **3 months** of availability data for all constraint nodes.
- App **hosted** (Vercel) + **GitHub** link + **documented prompts**.

Reconciliation: v0.1 builds and renders against a **1-week** window for speed, but data generation still produces the full **>=100 activities** and **3-month** availability so the release gate is satisfiable without rework. The 1-week scope is a view/scheduling horizon, not a data cap.

## Roadmap (post-v0.1)

- Move the data sampler **into the app** (generate on demand vs static CSV).
- Add **month overview** and **day view**.
- **Google-Calendar-style navigation** between month / week / day.
- Revisit **Supabase** for persistence if multi-session/multi-member is needed.
