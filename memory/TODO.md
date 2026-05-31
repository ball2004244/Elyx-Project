# Product Increment

Jira-like markdown template

## Active (v0.1)

- [x] Define data schemas (Activity = 16 fields incl. validity window; availability schemas for Travel, Equipment, Specialists, Allied Health, Client's Schedule with downtime/incidents) — single member
- [x] Generate sample data locally: 104 activities → `src/data/action_plan.csv` (release gate met)
- [x] Generate 3 months of availability data for all constraint nodes (normalized CSVs); validated, all references satisfiable
- [x] Implement the scheduler core (priority walk + multi-constraint slot placement, validity windows, downtime subtraction, role-based substitution, remote relaxation, backups, skip-adjustments, metrics attachment)
- [x] Render output as weekly grid + daily detail (React + Tailwind), 1-week window
- [x] UI rework: routine/event split (Daily Routine panel), deduped events (×N), grouped skipped list, Day/Week/Month switcher, corrected range header
- [ ] Host on Vercel (hard requirement) + GitHub repo + document AI prompts

## Backlog

- [ ] One-click in-app sampler button (BYOK): wire `sampler.js` to a provider adapter + a "Generate sample data" button; the action-plan prompt now encodes realistic modeling (supplement consolidation, guideline track, ~8-12 daily touchpoints)
- [ ] Scheduler optimization beyond greedy list-scheduling: a repair/backtracking pass that retries skipped high-value instances by displacing lower-priority placements; or a CP-SAT (OR-Tools) formulation with priority as weighted soft constraints. Tradeoff: loses the explainability/speed/stability of greedy, so only if placement rate proves insufficient.
- [ ] Adopt PapaParse as the CSV parser backend in `src/lib/csv.js` (battle-tested encoding/edge-case handling; already a dependency) — next version
- [ ] Adopt `jsonrepair` in the sampler's `extractJson` to salvage malformed/truncated LLM output — next version
- [ ] BYOK LLM sampler adapter + run scripts (sampler.js core already built; needs provider adapter)
- [ ] Move data sampler into the app (on-demand generation vs static CSV)
- [ ] Month overview + day view
- [ ] Google-Calendar-style navigation between month / week / day
- [ ] In-app CSV upload
- [ ] Supabase persistence (if multi-session/multi-member needed)
- [ ] Optional in-app "messy data" demo toggle (load src/data/messy_sample.csv to show graceful degradation live)
- [ ] Bundle/CWV optimization: fetch CSVs at runtime or lazy-parse instead of bundling as strings (data is ~150KB raw; bundle gzips to ~123KB)
- [ ] Metrics/adherence summary view

> Summary: Write this in 3-5 sentences when all boxed got checked out and user confirms sprint completion.
