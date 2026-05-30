# Product Increment

_Jira-like markdown template_

## Active (v0.1)

- [ ] Define data schemas (Activity with 10 fields; availability schemas for Travel, Equipment, Specialists, Allied Health, Client's Schedule) — single member
- [ ] Generate sample data locally as CSV: >=100 activities (release gate)
- [ ] Generate 3 months of availability data for all constraint nodes as CSV (release gate)
- [ ] Implement the scheduler core (priority walk + multi-constraint slot placement, remote relaxation, backups, skip-adjustments, metrics attachment)
- [ ] Render output as weekly grid + daily detail (React + Tailwind), 1-week window
- [ ] Host on Vercel (hard requirement) + GitHub repo + document AI prompts

## Backlog

- [ ] Move data sampler into the app (on-demand generation vs static CSV)
- [ ] Month overview + day view
- [ ] Google-Calendar-style navigation between month / week / day
- [ ] In-app CSV upload
- [ ] Supabase persistence (if multi-session/multi-member needed)
- [ ] Validation/edge-case handling (no valid slot, conflicting constraints, prep timing)
- [ ] Unit + integration tests for the scheduler
- [ ] Metrics/adherence summary view

> Summary: Write this in 3-5 sentences when all boxed got checked out and user confirms sprint completion.
