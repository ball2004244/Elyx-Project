# PLAN.md

**Date:** 2026-05-30
**Status:** v0.1 - active
**Scope:** Elyx Resource Allocator (see PROJECT.md). Stack & hosting per DECISIONS.md.

---

## Architecture overview

A client-side React SPA deployed on Vercel. Sample data ships as static **CSV** (sampled locally), loaded and parsed at runtime. The scheduler is a pure JS module (no backend) that takes the action plan + availability schedules and produces a personalized calendar, rendered by a Tailwind weekly-grid calendar view (v0.1).

```
data (static CSV, sampled locally)
  ├─ actionPlan.csv       (>=100 activities, priority-ordered)
  └─ availability/        (3 months)
       ├─ clientSchedule.csv
       ├─ travel.csv
       ├─ equipment.csv
       ├─ specialists.csv
       └─ alliedHealth.csv
          │kv
          ▼
  src/scheduler/  (pure functions)v
     loadData → buildConstraintIndex → schedule(plan, constraints) → plan[]
          │
          ▼
  src/components/  (React + Tailwind)
     WeekGrid + DayDetail ← personalizedPlan (1-week window for v0.1)
```

## Module layout

- `src/data/` - static sample data as CSV (sampled locally).
- `src/lib/schemas.js` - shape definitions / JSDoc typedefs for Activity and availability records.
- `src/lib/csv.js` - CSV parse/load helpers.
- `src/lib/dataGen/` - scripts to generate sample data (run with bun; output CSV to `src/data/`).
- `src/scheduler/`
  - `constraints.js` - index availability into fast lookups (is member free, is equipment free, is facilitator free, is travel-blocked).
  - `slots.js` - candidate time-slot generation per activity/frequency.
  - `schedule.js` - core engine: priority walk, multi-constraint placement, remote relaxation, backup fallback, skip-adjustment, metrics attachment.
- `src/components/` - `WeekGrid`, `DayDetail`, `DayCell`, `ActivityCard`, `UnplacedPanel`.
- `src/App.jsx` - load data, run scheduler, render the 1-week view.

## Scheduler algorithm (core)

1. Sort action plan by priority (health importance).
2. For each activity, compute required instances from frequency over the horizon (3 months).
3. Generate candidate slots; for each, check ALL constraints simultaneously:
   member-free AND not travel-blocked (unless remote) AND facilitator-free AND equipment-free AND prep-satisfiable.
4. Place greedily into the best valid slot; mark resources busy for that window.
5. If no valid slot: try backup activities (field 8); else apply skip-adjustment (field 9) and log as unplaced.
6. Attach metrics (field 10) to each placed instance.

Complexity target: index constraints into O(1)/O(log n) lookups so placement is near-linear in (activities × instances × candidate slots), avoiding naive O(n^2) scans.

## Build / run

- `bun install`
- `bun run dev` (local) - user runs this manually.
- `bun run gen` - regenerate sample data.
- Deploy: push to GitHub → Vercel auto-build (`bun run build`).

---

## Milestones

1. Schemas + data generation (>=100 activities, 3 months availability, as CSV).
2. Scheduler core + unit tests.
3. Weekly-grid + daily-detail calendar view rendering the personalized plan (1-week window).
4. Vercel deploy + GitHub + prompt docs.

## Roadmap (post-v0.1)

- Move the data sampler into the app (generate on demand vs static CSV).
- Add month overview + day view; Google-Calendar-style navigation between month / week / day.
- Revisit Supabase for persistence if needed.

See TODO.md for the working checklist.
