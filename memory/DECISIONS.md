# DECISIONS.md

Human-agent agreement. Captured before implementation. Update when a decision changes.

**Date:** 2026-05-30
**Status:** v0.1 - agreed

---

## Locked decisions

Consolidated by theme. The `#` column keeps the original decision ids (some
referenced in code comments); a range like D1–D7 means those entries were merged.
Superseded decisions are folded in as notes (e.g. the cadence classifier D30 was
reverted by D43; the 14/16-field schema D10/D11 was trimmed by D36).

### Foundation & hosting (D1–D8)

| #     | Decision                                                                                                                                                                                                      | Rationale                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| D1–D7 | React + JS + Tailwind, **bun**, deployed on **Vercel**; scheduler runs **client-side**; **single-member**; output is a **readable calendar**; data is **static CSV bundled in repo** (Supabase deferred, D4). | Per AGENTS.md + the assignment, which needs sample data + scheduler + readable output, no backend. Lowest-friction hosting. |
| D8    | Scheduler runs the **full 3-month horizon**; UI offers Day/Week/Month (the original "1-week v0.1 window" was superseded by D29).                                                                              | Monthly/yearly activities only appear over the full horizon; the week is just a view.                                       |

### Activity data model (D9–D11, D32, D36, D45)

| #   | Decision                                                                                                                                                                                                                            | Rationale                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| D36 | **Activity = 13 fields**: the 10 assignment fields + `id`/`priority`/`priorityRationale`. (Earlier D10/D11 added `requiredEquipment`/`track`/validity windows → 16; dropped for KISS.) `priorityRationale` is UI/traceability only. | Simplest model that satisfies the spec; equipment becomes a **venue-level** constraint derived from `location`; no phases (spec has none). |
| D9  | Sample action plan is **LLM-generated, Zod-validated**; `priority`/`priorityRationale` produced as if by HealthSpan AI.                                                                                                             | LLM plays the recommender; prompts are a required submission artifact.                                                                     |
| D32 | **Supplements consolidated** into AM/PM stacks; dose-sensitive prescriptions stay separate.                                                                                                                                         | 17 separate pill tasks was unrealistic/UX-hostile; a member opens a pill organizer twice.                                                  |
| D45 | `details` **leads with a name**; `shortLabel` extracts it, full text on hover (calendar + Self-care + Skipped).                                                                                                                     | Glanceable rows; fixed at the data source, not the output CSV.                                                                             |

### World model & data integrity (D12–D16)

| #   | Decision                                                                                                                                                             | Rationale                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| D13 | **Closed-world bank** + role-based selection + resource-level substitution.                                                                                          | Realistic multi-provider concierge; substitution adds scheduling intelligence. "Pick best available from the bank."                            |
| D14 | Referential integrity via `validateReferences` + defensive scheduling + tests; **demo data stays clean**.                                                            | Dangling refs degrade gracefully (treated as unavailable), proven by tests with synthetic broken input — not by dirtying reviewer-facing data. |
| D15 | Availability = **deterministic seeded generator**, not LLM; reasoned `downtime` + client-schedule `kind` for explainability (D12); normalized constraint CSVs (D16). | Hundreds of precise non-overlapping ISO windows are what code does perfectly and LLMs do unreliably. Realism injected deliberately.            |

### Scheduler core (D22–D25, D31, D41, D43)

| #       | Decision                                                                                                                                                                                      | Rationale                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D22     | The **member is a capacity-1 resource** (their own time is booked; nothing overlaps).                                                                                                         | Fixed the 05:00 pile-up: self/no-equipment activities never reserved member time, so 50+ stacked on the first free slot.                        |
| D43     | Classify by **resource-binding**: `isEvent = facilitator != self OR venue`. (Reverts the cadence rule D30.) Events contend for slots + the daily cap; self-care never does, at any frequency. | Robust to noisy data — a self-administered med is never wrongly capped; a provider/venue activity always contends. Cadence was a brittle proxy. |
| D24/D25 | Daily **event cap** (default 6) + inter-event **buffer** (default 30 min) + anchored spread; overflow → backup → skip.                                                                        | Realistic workload; priority fills the cap first; prevents back-to-back stacking.                                                               |
| D31     | Weekly distribution **phase-shifted by a per-activity hash**.                                                                                                                                 | Fixed the Monday pile-up (spread used to always start at day 0). Now ~uniform.                                                                  |
| D41     | `schedule(plan, constraints, range, opts)` takes `maxEventsPerDay`/`eventBufferMin`; UI sliders re-solve (debounced 200 ms).                                                                  | Lets the user watch the solver respond live without lag.                                                                                        |

### Calendar UI (D19–D21, D26–D29, D34, D37–D46)

| #                   | Decision                                                                                                                                      | Rationale                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| D19/D29/D38         | Single-screen app: **Day/Week/Month** switcher, agenda-per-day columns, **Morning/Afternoon/Evening bands** + a side panel.                   | Readable calendar without dead hour-grid whitespace; skipped instances need a panel (no slot).                                   |
| D20/D21/D42/D46     | Product-UI taste dials; **zinc base + locked teal accent**; activity-type hues inside blocks; colored icon+text legend; light/dark at parity. | Color Consistency Lock + accessible, decodable encoding of the scheduler's output.                                               |
| D26/D27/D44/D28/D35 | **"Self-care" panel** (member-performed, accordion) is separate from the events calendar; pure `ui/aggregate.js` view-model layer.            | A near-constant daily protocol shown once beats 53×7 cards; components stay dumb + unit-tested.                                  |
| D34/D40/D39         | **Skipped grouped by reason** with plain-language explanations, scoped to the visible range; human substitution notes ("Swapped for … — …").  | Answers "why so many skips"; raw ids/codes never leak to the user.                                                               |
| D37                 | **Dropped the adherence %**.                                                                                                                  | Scope-mismatched (windowed events vs whole-horizon skips) and conflated planning with member behavior; not required by the spec. |

### Process (D17, D18, D33)

| #       | Decision                                                                                                                                                   | Rationale                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| D17/D18 | **Prettier** (80-col, 2-space, single-quote, trailing commas) via `bun run format`; tests follow the **3-3-3 rule** (3 happy / 3 hard / 3 edge per suite). | Mechanical style enforcement; structured coverage. (The 3-3-3 rule in AGENTS.md superseded the earlier ">=5 cases" policy.) |
| D33     | Dietary **principles** are folded into routines, not scheduled as timed tasks. (The earlier separate `track='guideline'` field was dropped by D36.)        | Standing constraints aren't clock events; scheduling them inflated the daily count.                                         |

### Live LLM sampler — v0.2, `feat/sampler` (D47–D54)

| #       | Decision                                                                                                                                                                                                                                                 | Rationale                                                                                                                                                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D47     | First-visit welcome page: **Sample new data** (Groq) OR **Use our sample data** (instant default). Only the **action plan** is sampled; availability stays the deterministic bank (D15).                                                                 | A scheduler is most convincing handling a plan it's never seen; the action plan is the small varied input.                                                                                                                                                                                              |
| D48     | **Server-side Groq** via `/api/sample`; key is an env var, never in the browser. `.env` git-ignored, `.env.example` committed.                                                                                                                           | A key in the client bundle is a guaranteed credential leak. `api/` must be a Vercel-root function dir, separate runtime from `src/`.                                                                                                                                                                    |
| D49     | The sampler **references the fixed bank, never invents it** (canonical `eq-/sp-/ah-` ids + roles mirrored into the prompt).                                                                                                                              | Closed-world (D13) + referential integrity (D14): an invented resource fails validation and skips everything.                                                                                                                                                                                           |
| D50     | **Graceful fallback + `jsonrepair`**: salvage malformed JSON → lenient per-row parse (drop bad rows) → else fall back to bundled data with a notice.                                                                                                     | A flaky LLM must never block the working app; bundled data already meets the ≥100 gate.                                                                                                                                                                                                                 |
| D52/D54 | **Per-type bucketed sampling**: each call requests EXACT per-type counts (deterministic mix); big types split with `part/of` slice hints; capped at ~21/call to avoid truncation; merge renumbers ids + remaps backups + dedupes by (type+first-clause). | Single-call drifts off the mix (75 fitness vs ~40%) and truncates; "uniform-then-join" converges on dupes. Partitioning the space fixes both.                                                                                                                                                           |
| D53     | **Multi-key round-robin** (comma-separated `GROQ_API_KEY`) + 429/413 backoff; model **llama-3.3-70b-versatile**.                                                                                                                                         | Groq free tier ≈ 12K TPM per key; keys give independent budgets (30 RPM means request count was never the limit). llama-3.3 follows exact counts best — measured ~64/70 vs ~33/70 for llama-4-scout (30K TPM but weaker instruction-following); gpt-oss truncates (reasoning), compound emits non-JSON. |
| D51     | Ship on `feat/sampler` + preview deploy; promote to the main URL only once solid.                                                                                                                                                                    | A serverless+LLM addition is the riskiest change to an already-complete submission.                                                                                                                                                                                                                     |
| D55 | **Random sampler is the live UI path** (`src/lib/randomSampler.js`, client-side); the LLM sampler + serverless function are kept but **disabled** (moved to `disabled/api-sample.js`, not deployed). | Groq free-tier TPM/TPD limits made the LLM path unreliable for a live demo. A seeded random sampler is instant, key-free, rate-limit-free, runs client-side, and still demonstrates the scheduler handling a fresh plan. Mirrors the bundled CSV's bell-curve priority + per-type patterns; schema-valid + passes referential integrity (D49). **PDF note:** "≥100" = action-plan activity count (a floor, met by bundled 104), NOT bank size; the 26-resource bank is the separate 3-month availability deliverable. |
| D56 | Per-type content pools expanded to ~20-32 items; overflow appends a natural qualifier ("progression block", "deload week") not "(variant N)". | Small 8-15 pools made repetition the norm (a 100-plan reused most items); now only ~8 items repeat at total 100 and ~28 at 150, all with unique details. The qualifier reads like a real training progression instead of padding. New favicon (teal calendar glyph, replaces the stock Vite mark); Topbar "Start" → an icon-only "jump to first day" in the date-nav group + "New plan" gains a refresh icon (the two vague bordered buttons were confusing); welcome page gained a theme toggle (it renders before the Topbar's). |

---

## Data strategy detail (D4)

- v0.1: ship generated sample data as **static CSV** files (sampled locally) in the repo (`/data` or `/public`), loaded at runtime. No in-app upload yet.
- Data generation still produces the full **>=100 activities** and **3-month** availability (release gate), even though v0.1 schedules/renders a 1-week window.
- Supabase is deferred. Revisit only if we need persistence, multi-user, or auth. Not needed to satisfy the assignment.

## Scope guardrails

- Generate >=100 activities and 3 months of availability for all constraint nodes (Client's Schedule, Travel, Equipment, Specialists, Allied Health).
- Deliverables: hosted Vercel URL + public GitHub repo + documented AI prompts.

## Resolved (2026-05-30)

| #   | Question                   | Resolution                                        |
| --- | -------------------------- | ------------------------------------------------- |
| O1  | Single vs multiple members | **Single-member app** for v0.1.                   |
| O2  | Calendar granularity       | **Weekly grid + daily detail** for v0.1.          |
| O3  | Static vs in-app upload    | **Static CSV, sampled locally**, bundled in repo. |
| O4  | Scheduling/view window     | **1 week** for v0.1.                              |

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
