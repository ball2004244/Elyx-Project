# Lessons.md

History of decisions, what worked, and what to watch. Updated per iteration.

---

## Iteration 1 (2026-05-30): schemas + action-plan data

### What worked

- **Zod as the Pydantic-equivalent.** Using one schema module as the single
  source of truth meant the LLM-sampled batches, the CSV round-trip, and the
  (future) scheduler all validate against the same contract. Caught no bad rows
  in the 112-activity set because generation was schema-aware.
- **Parallel subagent sampling.** 6 subagents produced 112 activities
  (act-001..112) split by domain (cardio, strength/mobility, food, medication,
  therapy, consultation). Contiguous ids, no collisions, good type balance
  (40/24/18/18/12). Splitting by domain kept each subagent's output coherent.
- **Symmetric CSV mapping (`actionPlanCsv.js`).** Defining `activityToRow` and
  `rowToActivity` together, with a round-trip test, removed any risk of
  write/read drift for the flattened nested/array fields.

### Decisions / pivots

- Field count grew 10 → 13 → 14: assignment's 10 + id + priority +
  requiredEquipment + priorityRationale. `priorityRationale` added because we use
  an LLM sampler playing HealthSpan AI, and Elyx's brand is evidence-backed
  recommendations. Scheduler ignores it (traceability/UI only).
- Sampler became `sampler.js` (executable, BYOK) instead of a static prompts
  folder. The `src/prompts/` dir was dropped — prompts now live in code.
- Data source = static LLM-sampled CSV for v0.1; runtime BYOK adapter deferred
  to backlog.

### Gotchas

- **Vite scaffold auto-starts a dev server** and blocks the terminal. Had to
  scaffold into a temp subdir and kill the lingering vite/create-vite processes,
  then relocate files to root. Use background process control for dev servers.
- **Zod 4 API differs** from v3 (e.g. `z.iso.datetime({ local: true })`). Smoke
  tests up front confirmed correct usage before building on top.
- **Test mock matching bug:** the resource-pools prompt also contains the string
  "Action Plan", so a naive `prompt.includes('Action Plan')` matched the wrong
  branch. Match on unique phrases ("Generate an Action Plan" vs "Generate the
  resource pools").

### For next iteration

- Build the scheduler core now that both datasets exist and validate clean.

---

## Iteration 2 (2026-05-30): realism, validity windows, availability dataset

### What worked

- **Deterministic availability generator over LLM.** Expanding weekly patterns
  into concrete windows + injecting curated downtime/incidents/travel produced
  1508 valid, non-overlapping windows reproducibly. An LLM would have been
  unreliable at this volume of precise ISO datetimes. Right tool for the job.
- **Closed-world bank as a single source of truth** (`resourceBank.js`). Roles,
  ids, and weekly patterns live in one place, shared by the action-plan patch,
  the availability generator, and the validator — zero drift.
- **Role-based de-pinning + 2 extra providers** (ah-08 trainer, ah-09 physio)
  make resource-level substitution demonstrable, and the dataset's references
  still validate 100% against the bank.
- **Normalized constraint CSVs** (resources + windows + client + travel) kept the
  data DRY and human-readable instead of one giant denormalized file.

### Decisions / pivots

- Field count 14 → 16: added `effectiveFrom`/`effectiveUntil` validity window
  (decision a). 18 activities are now phase-based; the rest stay permanent.
- Added reasoned `downtime` + client-schedule `kind` (decision b) for explainable
  adaptations.
- Adopted closed-world + role-based selection + substitution (decision c) and
  validator-based referential integrity (decision d). Dangling refs are a
  validation/defensive-scheduling concern, NOT something to sample into demo data.
- Added 2 deliberately hard-but-valid activities (act-113 daily clinic sauna,
  act-114 in-person trainer power session) to visibly exercise skip/substitution.

### Gotchas

- A `require()` inside an ESM bun test silently breaks; use top-level imports.
- The Activity schema became a `.refine()`-wrapped object (validity ordering), so
  it is now a ZodEffects — fine for parsing, but `.shape`/`.extend` are no longer
  directly available if ever needed. Acceptable for now.

### For next iteration

- Scheduler must: respect validity windows; subtract downtime from availability;
  try role-substitution before backups; surface `reason`/skip text for the UI.
- Watch high-frequency activities (daily sauna act-113) during travel weeks —
  expect visible skips; that is intended, not a bug.

---

## Iteration 3 (2026-05-30): code-style normalization (CodeStyle.md)

### What worked

- **Prettier for mechanical rules.** printWidth 80 + 2-space + single-quote +
  trailing commas fixed ~148 over-length lines and indentation deterministically,
  far safer than hand-editing. Wired as `bun run format` + `.prettierrc.json`,
  with `.prettierignore` excluding data CSVs and the lockfile.
- **Separating content from code.** Comments were rewrapped by hand to <=80, but
  LLM prompt-content strings (sampler.js) and `test('...')` names were left long
  on purpose: reflowing prompt text changes what's sent to the model, and
  breaking test names hurts readability. Style rules apply to code structure,
  not string payloads.
- **Closing the test-coverage gap.** Added direct unit suites for csv.js (11),
  validate.js (7), transformActionPlan.js + canonicalizeRole (11) to honor the
  ">=5 cases/function, typical/edge/error" rule. Suite grew 24 -> 52, all green.

### Gotchas

- Prettier reformatted some single-line `//` comments onto wrapped lines; a few
  strReplace targets then failed because the on-disk text had already changed.
  Always re-read after a bulk formatter pass before doing targeted edits.
- Newly hand-written test files needed a second `prettier --write`; run
  `prettier --check` at the end to catch stragglers.

### For next iteration

- Keep `bun run format` in the loop before committing.
- Scheduler work is unchanged by this iteration (formatting only).

---

## Iteration 4 (2026-05-30): scheduler core

### What worked

- **Day-bucketed resource index.** Bucketing every availability/downtime/booking
  window by "YYYY-MM-DD" means each constraint check scans only that day's
  handful of windows, not all ~1500. Full 3-month schedule of 114 activities
  (5904 instances) runs in < 200 ms — no O(n^2) scan needed.
- **Greedy priority placement + shared booking index.** Bookings accumulate in
  the same buckets, so lower-priority activities naturally see higher-priority
  ones as busy. This implements the "priority resolves the 3 Forces" rule with
  no extra machinery.
- **Role-based substitution before backups.** `findProvider` tries a pinned id,
  else iterates all providers of the role. Both trainers (ah-01, ah-08) get used
  under load — confirmed by test. Activity-level `backups` only fire when no
  qualifying provider/equipment exists.
- **Explainable outcomes.** Each non-primary instance carries a reason
  (FAIL.TRAVEL/EQUIPMENT/PROVIDER/...) plus the activity's skip-adjustment text.

### Gotchas / fixes

- **`effectiveUntil` is an exclusive midnight boundary.** Naive `dayKey` clamp
  included the boundary day, placing instances after the window ended. Fixed by
  stepping the upper day back one when the until-instant is exactly T00:00:00.
- **A good backup hides a skip.** act-113 (daily clinic sauna) never reaches
  `skipped` because its backup act-099 (home contrast shower, self/no-equipment)
  is always placeable — including during travel. That is correct adaptation, not
  a bug; the test now asserts non-primary (backup OR skip), not skipped.
- Module-level helper `tryPlaceOnDay` needed the resource index passed explicitly
  rather than closing over it; caught before tests via diagnostics.

### For next iteration

- Build the React week-grid + day-detail view; consume schedule() + filterToRange
  + groupByDay. Surface `kind` (primary/backup/skipped) and `note` for
  explainability. Skipped instances need a side panel (no window to place them).

---

## Iteration 5 (2026-05-30): 3-3-3 test restructuring (AGENTS.md rule)

### What worked

- **3-3-3 as an explicit contract.** Restructuring all 11 suites into labeled
  `happy:` / `hard:` / `edge:` sections (3 each = 9/suite) made coverage gaps
  obvious and forced a "hard" tier (multi-constraint, substitution, real-data
  invariants) that the old "typical/edge" framing under-served. 99 tests, all green.
- **Reconciled the guideline.** Updated CodeStyle.md from the stale ">=5 cases"
  to the 3-3-3 rule with section-comment grouping, so the doc and AGENTS.md agree.

### Gotchas

- A grep audit (`happy:`/`hard:`/`edge:` counts) was the fast way to verify each
  suite is exactly 3-3-3; schemas.smoke had drifted to 4 edge and was merged back.
- Reorganizing test order means re-running `prettier --write` on the test files;
  a couple needed a second pass before `--check` was clean.

### For next iteration

- The calendar view is unblocked; tests are now a stable 3-3-3 baseline to extend
  per new module.

---

## Iteration 7 (2026-05-30): scheduler workload realism + the 05:00 pile-up bug

### The bug (member never booked)

The first UI render stacked ~100 instances on Monday, 61 at 05:00. Root cause: a
self-directed, no-equipment activity booked nothing — only equipment/providers
were reserved, never the member's own time. So 50+ activities all saw 05:00 free.
Classification: algorithm bug (missing resource = the member). The test suite had
no "member not double-booked" invariant, mirroring the code gap exactly.

### What worked

- **Treating the member as a capacity-1 resource** (`bookMember`) fixed the
  pile-up: Monday dropped from 100 → ~14 events with zero overlaps.
- **Event vs routine split** (`classify.isEvent`) was the key modeling move. The
  daily cap + inter-event buffer must apply to resource/venue EVENTS only;
  applying them to routines would skip medication/meals. Routines are spread,
  anchored checklist items that do not contend for exclusive slots.
- **Anchored spread** (`targetPlacements` with morning/noon/evening anchors +
  per-activity jitter) stopped multi-instance activities collapsing onto one slot.

### Gotchas / iterations within the iteration

- First fix over-corrected: making routines ALSO capacity-1 produced 4294 skips
  (statins "skipped" — clinically wrong). Correct model: routines check only hard
  commitments, never book exclusive member time. Result: 450 legitimate skips
  (travel / no-provider / daily-cap), not 4294.
- Debug counters were misleading (routines "overlapping" is fine; backups keep
  the original activityId). The real invariants to assert are on PRIMARY EVENTS:
  no overlap, under cap. Verify the right thing, not the convenient thing.

### For next iteration

- UI rework now unblocked: routine/event split in the data lets the UI render
  routines as a daily checklist (not 50 cards) and collapse repeats (×N). Plus
  fix the misleading "June 2026" week header and add a Day/Week/Month switcher.

---

## Iteration 8 (2026-05-30): UI rework — routine/event split, dedup, views

### What worked

- **Pure aggregation layer (`ui/aggregate.js`) before components.** Building
  splitPlan / dedupeDay / buildDailyProtocol / groupSkipped as pure functions
  with 3-3-3 tests first meant the components stayed dump-and-render. The wall of
  90 Monday cards became ~26 deduped events + a Daily Routine panel.
- **Daily Routine panel (option b).** A longevity protocol is ~53 distinct daily
  routines (15 meds, 15 food rules, mobility/breathwork) — realistic in COUNT but
  unreadable as 53×7 cards. Showing it ONCE, grouped by type, with the calendar
  carrying only the day-to-day-varying EVENTS, is the right separation.
- **Grouped skipped list.** Was N raw rows; now one row per activity with ×count
  + distinct reasons + adjustment, sorted most-skipped-first.

### Gotchas

- `react-refresh/only-export-components` lint error: a pure helper
  (`tagEventsForMonth`) exported from a component file fails the rule. Move pure
  transforms to `ui/aggregate.js`; component files export only components.
- Day view needed deduped rows (they carry `_key`); passing raw instances broke
  selection keys. Route everything through `dedupeDay`.

### Data-realism note

~53 routines/day is plausible for concierge longevity (not bloat); the fix is
presentation, not trimming data. One outlier flagged for future: act-030 (eye
exercise 8x/day) is really an all-day reminder — could model >4x/day items as a
single "ongoing reminder" rather than N instances (backlog).

### For next iteration

- Hosting (Vercel) + GitHub + prompt docs — the last release-gate items.

---

## Iteration 9 (2026-05-30): distribution + classification fixes

### Two bugs the UI surfaced

1. **act-062 ×69 skips.** "Photo-log meals" (3x/day, nominal health-coach
   facilitator) was classified as an EVENT, so it hit the daily cap and skipped
   69 times. Fix (D30): daily-cadence items are ALWAYS routines — a nominal
   async facilitator does not make a daily log an appointment.
2. **Monday pile-up (308 events vs ~110 avg).** `spreadDays` always started
   day-selection at index 0 (Monday), so every weekly activity clustered early
   in the week. Fix (D31): phase-shift day selection by a per-activity hash →
   near-uniform weekday distribution (busiest weekday now < 35%, was ~45%+).

### Result

5132 primary / 392 backup / 360 skipped (was 5132/.../450). Weekday spread
[Sun 106, Mon 114, Tue 111, Wed 115, Thu 71, Fri 111, Sat 91]. act-062 now a
routine with a small explainable tail (27 no-provider skips, not 69 cap skips).

### Note on units (recurring confusion)

114 activities != ~5900 instances. An activity is a recurring RULE; it expands
over the 3-month horizon by frequency (daily ~92x, 3x/week ~39x, weekly ~13x).
The calendar and skip counts are in INSTANCES. Both numbers are correct.

### Honest residual

act-062 over-specifies its facilitator (an async photo-log shouldn't require the
coach present); the 27 skips are a data-modeling nuance, left honest for now.
The uniform spread was chosen over a mid-week bell curve per user preference.

### For next iteration

- Hosting + GitHub + prompt docs.

---

## Iteration 10 (2026-05-30): realistic modeling + panel UX (D32-D35)

### The challenge

User: "I can't imagine doing 59 routines daily — is that fact-based?" Honest
answer: content was fact-grounded (real longevity protocols stack ~15-17 daily
supplements, per Blueprint/Attia-style programs), but the GRANULARITY was the
artifact — 17 separate supplement tasks + dietary principles modeled as timed
tasks inflated the count beyond what a human experiences.

### What changed

- **Supplement consolidation (D32):** 12 supplements → 2 AM/PM stacks;
  dose-sensitive prescriptions stay separate. 114 → 104 activities (above gate).
- **Guideline track (D33):** `Activity.track` ('scheduled' | 'guideline'). 7
  dietary principles shown in a panel, never scheduled. Daily routines now ~20.
- **Skipped by reason (D34):** side panel groups skips by reason with
  plain-language labels + explanations, collapsible. Answers "why so many?".
- **Daily Routine accordion (D35):** collapsed-by-type with summary chips.
- **Sampler prompt updated** to encode this realistic modeling, for the future
  one-click in-app sampler (backlogged).

### Result

104 activities → 3921 primary / 276 backup / 336 skipped. Daily Routine 44
distinct routines collapsed into a 4-group accordion.

### Note on units (recurring)

PDF's "100 activities" = 100 RULES, not 100 instances. Each rule expands over
the 3-month horizon by frequency.

### For next iteration

- Hosting (Vercel) + GitHub + prompt docs.

---

## Iteration 11 (2026-05-30): KISS — drop the 4 extension fields (D36)

User: "reduce to the og 10 fields — KISS, we don't need a complicated UI."

### What changed

Dropped `requiredEquipment`, `track`, `effectiveFrom`, `effectiveUntil`. Kept the
10 assignment fields + `id`/`priority`/`priorityRationale` → **13 columns**.
- Equipment → **venue-level** constraint derived from `location` (gym/clinic open
  at the slot? maintenance still blocks). `resourceIndex` now builds a per-venue
  availability index instead of per-equipment-id.
- Guidelines folded back into routines (no `track`); removed `GuidelinesPanel`,
  `buildGuidelines`, and the guideline skip in the scheduler.
- No phases (no validity windows); removed `clampRange`.
- `validate.js` drops equipment-reference checks (keeps facilitator role/id).
- Supplement consolidation (D32) KEPT — it uses only core fields.

### Result

104 activities, 13 cols → 4744 primary / 460 backup / 374 skipped. Venue
constraint fires (36 venue-unavailable). Core scheduler + event/routine split +
all calendar views survived unchanged — confirming the extensions were
precision/polish, not load-bearing.

### Gotcha

Touched ~15 files; 12 tests referenced removed fields. Fixed each (schema
defaults, validate equipment cases → facilitator cases, messy sample
eq-999 → sp-999, transform VALIDITY → supplement consolidation). All suites
kept 3-3-3; 126 green.

### For next iteration

- Hosting (Vercel) + GitHub + prompt docs.

---

## Iteration 12 (2026-05-30): backup substitutions double-booked the member

User saw two occurrences at the same time on the calendar.

### Root cause

When an EVENT's primary failed and it fell back to a backup, `tryPlaceOnDay` was
called for the backup with the BACKUP's own classification. If the backup was a
routine (e.g. event act-092 "coach meditation" → backup act-091 "self
breathwork"), it placed without reserving the member's exclusive slot — yet the
instance kept the original event id, so the UI rendered it as an event on top of
a real event. Member double-booked.

The overlap test missed it because it only checked `kind === 'primary'` (the
test gap mirrored the code gap, again).

### Fix

`tryPlaceOnDay` now takes an `asEvent` parameter; the backup attempt passes the
ORIGINAL activity's event-nature, so a substituted event still books the member
+ respects cap/buffer. Strengthened the invariant test to cover ALL placed
events (primary + backup), not just primary.

### Result

Event overlaps 0 (incl. backups); week-1 same-time render clashes 0. Skipped rose
374 → 695: substituted events now honor exclusivity and correctly skip rather
than silently double-book. An honest skip beats a false overlap.

---

## Iteration 13 (2026-05-30): adherence-% bug + day-part bands (D37/D38)

User: "adherence is 1%/6%/19% — what does it track? does the PDF need it? and
there's no space for free time on the calendar."

### Adherence bug → dropped (D37)

The metric was scope-mismatched: `placed`/`backup` counted only the VISIBLE
window's EVENTS, while `skipped` was the WHOLE-HORIZON count — so it shrank with
the window (day ~1%, week ~6%, month ~19%). It also excluded routines and
conflated "skipped" (a planning outcome) with "not adhered" (member behavior we
don't model). The assignment does not require it. Dropped it rather than ship a
misleading number; real adherence (completion events) is a future feature.

### Day-part bands (D38)

Added Morning / Afternoon / Evening bands to the week + day views (helper
`bandByDayPart` + `dayPart` boundary 12:00/17:00). Empty bands render "Open", so
free time is visible without the dead whitespace of a full hour-grid — keeping
the agenda density advantage from D19.

### Result

127 tests green (folded band coverage into existing tests to stay 3-3-3), lint
clean, build OK. Bands verified against real data (sensible AM/PM/EVE splits).

### For next iteration

- Hosting (Vercel) + GitHub + prompt docs.

---

## Iteration 14 (2026-05-30): readable substitutions + view-scoped metrics (D39/D40)

User: "'Substituted with act-024 (venue-unavailable)' is unclear; and the
skipped/metrics should scope to the selected day/week/month, not the 3-mo total."

### D39 — human substitution notes

Scheduler now emits STRUCTURED `reason` (raw FAIL code) + `backupId` on
instances instead of a baked string. The UI (`substitutionNote` in aggregate.js)
formats "Swapped for {backup.details} — {plain reason label}". Raw ids/codes no
longer leak to the user. `groupSkippedByReason` reads `inst.reason` (not a
parsed note).

### D40 — scope to the view

Skipped instances now carry their intended `day` (they have no window). App
filters both the summary strip and the skipped panel to the visible range's
days, so week 1 shows 47 skips (not the whole-horizon 695). Summary `skipped`
derives from the same scoped set.

### Result

127 tests green (updated groupSkippedByReason fixtures to structured reason;
added substitutionNote + bandByDayPart coverage within 3-3-3). Lint clean,
build OK. Verified: week-1 skips scoped correctly, substitution note reads as a
sentence.

### For next iteration

- Hosting (Vercel) + GitHub + prompt docs.

---

## Iteration 15 (2026-05-30): live workload controls (D41)

User: "let the user modify the daily workload limit and the gap between events in
real time — this shows the algo actually running."

### What changed

- `schedule(plan, constraints, range, opts)` now takes `{ maxEventsPerDay,
  eventBufferMin }`, threaded into `tryPlaceOnDay` via a `policy` object
  (defaults from config.js). Pure + no global mutation.
- Split `loadData()` (parse once) from scheduling so the app re-runs `schedule()`
  reactively in a `useMemo` keyed on `policy`.
- `WorkloadControls` — two sliders (cap 1-12, gap 0-120min); `onChange` updates
  policy → scheduler re-solves (<200ms full horizon).
- crash fix carried in: `dedupeDay` now carries `reason`/`backupId`, and
  `reasonLabel` guards falsy input (fixed the substituted-item detail crash).

### Verified

cap 6→3: primary 4627→4484, skipped 695→926. buffer 30→120min: skipped
695→838. Re-solve 90-220ms — interactive. 127 tests green (added a policy
assertion to the schedule cap test), lint clean, build OK.

### For next iteration

- Hosting (Vercel) + GitHub + prompt docs.

---

## Iteration 16 (2026-05-30): resource-binding classifier + Self-care rename

User pushback: cadence-based classification (D30: daily=routine) is brittle on
real data — a weekly/monthly medication would be a capped EVENT and get
wrongly skipped, while a daily provider session would dodge contention.

### D43 — classify by RESOURCE-BINDING, not cadence

`isEvent = facilitator != self OR venue location`. Dropped the `period !== 'day'`
clause. The real reason a med must never be capped isn't that it's daily — it's
that it needs no scarce resource (no person, no venue). So:
- self-administered med/meal/home-workout → self-care, never capped, ANY cadence
- provider- or venue-bound activity → event, contends, ANY cadence

Robust to noisy data (the user's point). The two daily activities that named a
nominal facilitator (act-062 photo-log, act-046 fiber target) were fixed at the
DATA level (facilitator → self) rather than papered over by a cadence rule —
that's the honest fix for the case D30 was patching.

### D44 — rename "Daily Routine" → "Self-care"

Under resource-binding the panel holds non-daily items too (weekly self workout),
so "Daily Routine" misled. "Self-care" = member-performed, no booking.

### D42 — legend colored text+icon (no dots)

Removed `TYPE_STYLE.dot`; legend/month-cells/protocol-chips use the colored
type icon + label. Dots weren't decodable (color-blind, 5 muted hues).

### Result

4706 primary / 170 backup / 702 skipped; ZERO medications capped out (the
invariant the user cared about). 127 tests green, lint clean, build OK.

### For next iteration

- Hosting (Vercel) + GitHub + prompt docs.

---

## Iteration 17 (2026-05-30): de-wall the Self-care + Skipped lists

The two panels rendered the FULL clinical sentence per row ("Brisk outdoor walk,
30-40 min at 100-120 steps/min, prioritise post-meal timing...") = a wall.

### Fix (taste-skill: long lists need a different component)

- `shortLabel(details)` — first clause, capped at ~42 chars ("Rosuvastatin 10
  mg", "Barbell back squat"). Full text preserved as a `title` hover tooltip.
- Self-care expanded groups now render short labels in a 2-COLUMN grid (uses the
  horizontal space, halves vertical height).
- Skipped-by-reason items use the short label too (was truncating mid-sentence).

### Result

Glanceable rows, full detail on hover, denser layout. 127 tests green (added
shortLabel coverage), lint clean, build OK.

### For next iteration

- Hosting (Vercel) + GitHub + prompt docs.

---

## Iteration 18 (2026-05-31): fix weak short-labels at source + label the calendar

User: some short labels read wrong ("When dining out"); fix the og data, and
apply short labels to the main calendar too.

### Root cause

`shortLabel` extracts the first clause (split on `[,;:.]`). It only reads well
when `details` LEADS with the activity's name. ~18 food activities (batch-3)
were authored as imperative guidelines — "When dining out, order...", "Drink
~2,500 ml...", "Confine all eating...", "Audit the week's intake..." — so the
first clause was a sentence fragment, not a label. A few others split mid-phrase
or inside parentheses ("Eat a 150 g serving of oily fish (salmon").

### Fix (at the data source, not the output CSV)

- Prepended a concise "Name:" prefix to each weak `details` in
  `temp/action_plan_batches/batch-3.json` (shortLabel splits on `:` first):
  Dining out, Hydration, Time-restricted eating, Fermented food, Olive oil,
  Plant protein, Protein breakfast, Limit alcohol, Early dinner, Weekly meal
  planning, Post-workout fuel, Pre-workout fuel, Limit added sugar, Limit
  ultra-processed, etc. Full guidance is preserved after the colon and shows on
  hover. Other batches already lead with nouns (med/exercise names) — untouched.
- `ActivityBlock.jsx` now renders `shortLabel(details)` with the full `details`
  as a `title` tooltip — so the main calendar matches Self-care + Skipped.

### Why source-edit (recurring principle)

Data content bugs get fixed in the batch JSON and regenerated (`gen:action-plan`
+ `gen:messy`), never by patching `src/data/*.csv` directly — keeps the
generator the single source of truth.

### Result

104 activities regenerated; calendar/self-care/skipped all show clean glanceable
labels with full detail on hover. 127 tests green, lint clean, build OK, prettier
clean.

### For next iteration

- Hosting (Vercel) + GitHub + prompt docs — the last release-gate items.

---

## Iteration 19 (2026-05-31): light-mode activity-type colors (D46)

User: dark mode looks great, but the color scheme isn't good in light mode.

### Root cause

`TYPE_STYLE` had asymmetric light/dark blocks. Dark mode used a clearly-tinted
fill (`dark:bg-sky-500/10`) + a bright readable label (`dark:text-sky-200`) over
the near-black canvas — crisp, color-coded chips. Light mode used `bg-sky-50`
(barely a tint over the white card) + `text-sky-900` (so dark it read as
near-black, killing the hue). So in light mode the five activity types collapsed
into near-white cards with black-ish text and lost their color identity / became
hard to tell apart.

### Fix (D46) — bring light mode to parity

Per type: light fill `-50 → -100` (a visible tint), label `-900 → -800`
(stays WCAG AA over the `-100` fill but is now visibly the type's hue), ring
kept at `-200`. Dark mode untouched. The `-100/-800` light pairing already
matches the app's other light-mode tints (e.g. the amber skipped-count badge),
so it stays within one palette.

### Result

Light mode now has the same legible, color-coded blocks as dark mode; types are
distinguishable at a glance. 127 tests green (encoding test asserts non-empty
block/text, unaffected), lint clean, build OK.

### For next iteration

- Hosting (Vercel) + GitHub + prompt docs — the last release-gate items.

---

## Iteration 20 (2026-05-31): live LLM sampler + welcome page (D47-D51)

User reframed the backlogged in-app sampler as a UX (not UI) win: let first-time
visitors either sample fresh data or use ours, via Groq directly (cheap), no BYOK.

### Decisions / pivots

- **Server-side Groq, never in-browser (D48).** A client-side app calling Groq
  directly ships the key in the bundle = guaranteed credential leak. Built a
  Vercel serverless function `/api/sample` that holds `GROQ_API_KEY` as an env
  var and reuses the existing `sampleActionPlan` (so output stays Zod-validated).
- **Sample the ACTION PLAN only (D47), not availability.** Availability is 1500+
  precise ISO windows — deterministic by design (D15). One Groq call, not three.
- **Sample FROM the bank, never the bank (D49).** Cleared a user mix-up: the
  "~100 entries" is the action plan, not the bank (26 resources). A fixed 26-
  resource cast supports unbounded distinct plans (like 26 letters → infinite
  sentences); the bank only bounds the `facilitator` of non-self activities, so
  it caps FEASIBILITY (over-asking a scarce specialist → honest skips), not
  variety. Mirrored the bank ids/roles into sampler.js as prompt text (src/ may
  not import scripts/).
- **Graceful fallback + jsonrepair (D50).** extractJson now has a third tier
  (JSON.parse → span-slice → jsonrepair). Any sampling failure falls back to
  bundled data with a notice; bundled data is always the instant default.
- **Branch + preview deploy (D51).** Built on feat/llm-sampler; promote to the
  main URL only after a preview deploy with the key set is verified.

### What worked

- **The sampler was already DI-shaped (BYOK).** `sampleActionPlan({ invokeLLM })`
  meant the serverless function is a thin Groq adapter — zero core rewrite. The
  Dependency Inversion from iteration 1 paid off exactly as intended.
- **Bank as read-only context.** `buildBankSummary(constraints)` (pure, in
  aggregate.js, derived from the loaded CSVs — no scripts/ import) renders the
  care team (by role, with remote flag) + venues on the welcome page. Customize
  the PLAN REQUEST (count, type mix); the bank stays read-only — truthful to the
  concierge model (the member doesn't pick the roster).
- **Prompt rewrite caught real drift.** The old action-plan prompt still asked
  for `requiredEquipment` + `track` — fields D36 DELETED. Rewrote it to the real
  13-field schema and baked in every resolved lesson (resource-binding
  classification D43, supplement consolidation D32, name-led details D45,
  priority clustering, venue-level equipment).

### Gotchas

- ESLint flagged `process`/`Buffer` in `api/` (browser globals config). Added a
  Node-environment override for `api/**` + `scripts/**`.
- `bun run format` only globs src/scripts/tests — `api/` needs a manual prettier
  pass. (Left as-is; could widen the glob later.)
- `.env` was NOT git-ignored. Added `.env` / `.env.*` (keep `.env.example`)
  BEFORE writing any key-touching code.

### For next iteration

- Preview-deploy with `GROQ_API_KEY` set; manual QA the sample→schedule→explore
  loop + the fallback path; then promote to the main URL.
- Consider a count/timeout guard if sampling proves slow on the free tier.

---

## Iteration 21 (2026-05-31): per-type parallel sampling + multi-key rotation (D52/D53)

User asked whether one Groq call or many is better, and whether to "sample
uniformly then join."

### Decisions / reasoning

- **Per-type, not uniform-then-join (D52).** Clarified a counterintuitive trap:
  running K identical "uniform mix" prompts CONVERGES on the same popular items
  (Zone-2 run, sauna, supplement stack) → heavy cross-batch duplication after
  join, FEWER unique rows. The lever for diversity is PARTITIONING the space:
  one call per activityType, each asked for an EXACT count of DISTINCT items.
  Distribution becomes deterministic (we compute counts from the sliders), and
  cross-type dupes are impossible by construction. Mirrors iteration-1's 6
  by-domain subagents.
- **`computeTypeCounts`** (largest-remainder) turns total+fractions into exact
  per-type integers that sum to the total.
- **`mergeActionPlanBatches`**: dedupe by (type + normalized first clause) →
  renumber ids contiguously → CRUCIALLY remap each batch's internal `backups` id
  references to the new ids (the scheduler resolves backups by id — `byId.get`),
  label backups pass through → sort by priority.

### The real blocker: TPM, not the model (D53)

First parallel run returned 0 activities with no errors logged — the calls were
silently 413ing. Root cause: **Groq free tier ≈ 12,000 TPM**. My `max_tokens:
16000` ALONE exceeded it (a request reserves prompt+max_tokens against TPM), and
5 per-type calls (~5.4K tokens each) overshoot one key's per-minute budget even
sequentially (they land in the same rolling minute). Fixes:
- `max_tokens` → 3500; live count clamp lowered to 30–80 (bundled data meets the
  ≥100 gate, so the LIVE cap can be small).
- **Multi-key round-robin:** `GROQ_API_KEY` now accepts comma-separated keys; the
  adapter round-robins calls across them (independent TPM budgets) and
  rotates+backs off on 429/413. Concurrency = key count. With 3 keys: count 70 →
  HTTP 200 in 7.2s, all 5 types succeed, mix balanced (21/14/11/10/7 — dedupe
  trimmed 7 near-dup fitness, the diversity safeguard working), 63 unique rows,
  schedules clean, all 14 id-backups resolve.

### Gotchas

- `Promise.allSettled` swallowed the 413s into empty fulfilled batches (the
  filter dropped nothing because there was nothing) → 0 rows, no error. Had to
  probe the raw Groq HTTP status directly (413 body) to find the TPM limit.
- A single big call (8K) had worked earlier — masking the TPM ceiling until the
  per-type split multiplied prompt overhead 5×.

### Security

- Real Groq keys were pasted into chat/.env again (3 this time). `.env` is
  git-ignored, but treat them as dev/throwaway and rotate before any real launch.

### For next iteration

- Preview-deploy with `GROQ_API_KEY` (comma-separated) set in Vercel env; QA the
  loop; then promote. 154 tests green, lint clean, build OK.


## Iteration 22 (2026-05-31): side panel showed resource ids, not names (D58)

User: "when I select an item, shouldn't the facilitator be a name instead of
id?" The detail panel showed `ah-08` where it should read "Daniel Kim".

### Root cause

`SidePanel` rendered `instance.facilitatorId`/`instance.equipmentIds` verbatim.
The scheduler only carries ids (it works in id-space — `schedule.js` sets
`facilitatorId: provider.meta.id`), while the human NAMES live in the loaded
`constraints` (resources.csv → equipment/specialists/alliedHealth, each with a
`name`/`role`). Nothing rejoined the two on the way to the UI.

### Fix (D58) — rejoin ids → names in the pure view-model layer

- `buildResourceIndex(constraints)` (aggregate.js, pure) → `Map<id, {name, role,
  kind}>` over all three resource kinds.
- `facilitatorLabel(id, index)` → "Name · role" (name-only when role-less, raw
  id as a safe fallback for unknown ids); `equipmentLabels(ids, index)` → names.
- `App` memoizes the index from `data.constraints` and passes `resourceById` to
  `SidePanel`; the detail rows now resolve through the helpers.

### Why this layer

Same principle as D39's substitution notes: the scheduler stays in id-space
(pure, testable), and the UI rejoins to human-readable names in `ui/aggregate.js`
(the one place that owns presentation joins). Components stay declarative; the
join is unit-testable without React. Defensive fallbacks (unknown id → raw id,
missing index → raw id) keep a sampled/edited plan from ever crashing the panel.

### Result

Facilitator reads "Daniel Kim · personal trainer", equipment shows names. +9
3-3-3 tests (buildResourceIndex / facilitatorLabel / equipmentLabels) → 181
green, lint clean, build OK.


## Iteration 23 (2026-05-31): surface the full PDF activity record (D58/D59)

User re-read the assignment PDF and asked, field by field, whether each of the
10 activity fields was actually surfaced. Honest audit found several were
captured-but-dormant.

### What was actually missing (vs. captured)

All 10 fields existed in the schema/CSV/sampler; the GAP was the UI. Coverage
across the 104 bundled activities: prep 89, backups 83, skipAdjustment 104,
remoteCapable 34. None of prep / skipAdjustment was rendered; location and
facilitator/equipment names were added in D58 (iter 22).

### The Remote red herring (the useful catch)

The panel HAD a "Remote: Yes" row, but it read `instance.isRemote`, which
schedule.js only sets true when `Boolean(traveling) && activity.remoteCapable`
— i.e. ~6% of instances (352/5578), travel windows only. So a remote-CAPABLE
activity (34/104) showed nothing on a normal day. Lesson: distinguish a
CAPABILITY field (static, on the activity) from a RUNTIME decision (on the
instance). `remoteLabel(activity, instance)` now surfaces the capability and
upgrades the wording when the occurrence is actually delivered remotely.

### Density without a wall (taste)

10 fields in one flat `divide-y` list is a wall. Grouped into **Scheduling**
(when/where/who) + **Guidance** (prep/metrics/if-skipped) via a tiny
`DetailGroup` (uppercase micro-label + the existing divider). DENSITY-6 product
UI, so dense-but-structured is correct — taste-skill is scoped to landing pages,
its density principle still applies. Skip-adjustment's primary home is the
skipped-by-reason list (where "didn't place" lives), shown as a muted "If
skipped: …" sub-line per activity. Backups stay as the human swap note (D39),
not a raw-id row — listing ids on every primary instance is noise.

### Principle reused

Same split as D39/D58: scheduler/data stay in their native shape; the UI rejoins
+ formats in pure helpers in `ui/aggregate.js` (`remoteLabel`, skipAdjustment on
grouped items), so it's unit-testable without React.

### Result

+9 3-3-3 tests (remoteLabel + skip-adjustment carry/fallback) → 190 green, lint
clean, build OK, prettier clean. All 10 PDF activity fields now represented in
the UI.
