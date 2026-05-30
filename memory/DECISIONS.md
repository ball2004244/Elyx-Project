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
