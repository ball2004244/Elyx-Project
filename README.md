# Elyx Resource Allocator

Turns Elyx HealthSpan AI recommendations into a schedulable, constraint-aware
personalized calendar. It sits on the **adherence** side of Elyx's
accuracy-vs-adherence model: HealthSpan AI decides _what_ a member should do; the
Resource Allocator decides _when and how_ it can actually happen.

- **Live app:** http://elyx-project-snowy.vercel.app/
- **Repo:** https://github.com/ball2004244/Elyx-Project
- **AI prompts used:** documented in [`chats/`](chats/) (full build transcript)

## What it does

Given an **action plan** (priority-ordered health activities) and **3 months of
availability** for the constraint nodes, it produces a personalized calendar:
each activity instance is placed where every dependency aligns, with backups and
skip-adjustments when no slot fits.

- **Input:** `src/data/action_plan.csv` (104 activities, 10 assignment fields +
  id/priority/priorityRationale; 5 types: fitness, food, medication, therapy,
  consultation).
- **Constraints (3 months, 2026-06-01 → 08-31):** equipment, specialists, allied
  health (`resources.csv` + `resource_windows.csv`), the member's own calendar
  (`client_schedule.csv`), and travel (`travel.csv`).
- **Output:** a readable Day / Week / Month calendar with a Self-care panel and a
  grouped, explainable skipped list.

## Scheduler

Pure, framework-free JS (`src/scheduler/`). Priority walk → for each activity,
expand its frequency over the horizon → search candidate slots that satisfy **all**
constraints simultaneously (member free, not travel-blocked unless remote,
facilitator free, venue/equipment free) → place greedily and mark resources busy →
on failure try role substitution, then activity backups, else record a skip with a
plain-language reason. Day-bucketed lookups keep placement near-linear.

## Quick start

This project uses **bun**.

```bash
bun install
bun run dev      # local dev server (run manually)
bun run build    # production build
bun test         # 127 tests, 3-3-3 per suite
```

Regenerate sample data:

```bash
bun run gen:action-plan   # rebuild action_plan.csv from temp/action_plan_batches
bun run gen:availability  # rebuild constraint CSVs
```

## Stack

React 19 + JavaScript + Tailwind v4 (Vite), Zod for schema validation, deployed on
Vercel. Client-side only — the scheduler runs in the browser, no backend.

## Project map

```
src/data/        static sample CSVs (action plan + availability)
src/lib/         CSV parse, schemas (Zod), referential-integrity validator, sampler
src/scheduler/   pure scheduling engine (intervals, slots, resource index, schedule)
src/ui/          pure view-model layer (aggregate, encoding) + theme/icons
src/components/  React calendar UI (Week/Day/Month, panels, controls)
scripts/         build-time data generators (never shipped to the browser)
tests/           unit + integration tests
memory/          design docs — start with PROJECT.md and DECISIONS.md
chats/           full build transcript + the AI prompts used
```

## Design docs

The reasoning behind every decision lives in [`memory/`](memory/):
`PROJECT.md` (what it is), `DECISIONS.md` (locked human-agent agreements),
`GLOSSARY.md` (terminology), `Implement.md` (architecture), and `Lessons.md`
(iteration history).
