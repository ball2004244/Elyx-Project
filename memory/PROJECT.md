# Resource Allocator

**Date:** 2026-05-30
**Status:** v0.1 - active
**Description:** Turns Elyx HealthSpan AI recommendations into a schedulable, constraint-aware personalized calendar.

---

## What This Is

A take-home build of Elyx's **Resource Allocator**: the system that transforms an action plan (health recommendations from HealthSpan AI) into daily / weekly / monthly / yearly tasks, then coordinates against the availability of people, equipment, and member context to produce a realistic, adherable plan. It sits on the "adherence" side of Elyx's accuracy-vs-adherence model: HealthSpan AI decides _what_ a member should do, the Resource Allocator decides _when and how_ it can actually happen.

**Input:**

- **Action Plan** - priority-ordered list of activities (priority = health importance). Each activity carries up to 10 fields: type, frequency, details, facilitator, location, remote-capable flag, prep required, backup activities, skip-adjustments, metrics to collect.
- **Constraint / availability schedules** (3 months) for the orbiting nodes:
  - Client's Schedule (member's own calendar)
  - Travel Plans (windows that change location or availability)
  - Equipment (when each item is free)
  - Specialists (availability for consultations)
  - Allied Health (physios, dietitians, OTs, speech therapists)

**Output:**

- A personalized plan rendered in a readable **calendar format** (no polished UI required).
- Each scheduled instance respects all dependencies and attaches its metrics; unplaceable activities resolve via backups or skip-adjustments.

---

## The Approach

### Activity model

Each action is one of five activity types: fitness/exercise, food consumption, medication consumption, therapy (sauna/ice bath), or consultation. Frequency (e.g. 3x/week) defines how many instances per period must be placed.

### Scheduling logic

1. Walk the action plan in **priority order** (most health-important first).
2. For each activity, attempt to place its required frequency into open slots where **all** dependencies align simultaneously:
   - member is free (Client's Schedule) and not blocked by Travel,
   - the facilitator is available (Specialist / Allied Health),
   - required Equipment is free,
   - any prep can be completed beforehand.
3. **Remote-capable** activities relax the location/travel constraint (e.g. trainer over video call).
4. If no valid slot exists, fall back to a **backup activity**; if still unplaceable, apply the **skip-adjustment** rule.
5. Attach **metrics** to each placed instance for downstream collection.

### Data scope

- Generate realistic sample data for **≥100 activities** (CSV/JSON).
- Generate **3 months** of realistic availability data for the constraint nodes (CSV/JSON).

### Stack & hosting

- React + JavaScript + Tailwind, managed with **bun**.
- App must be **hosted on the internet** (hard requirement - submission is not reviewed otherwise).
- Deliverables: GitHub link + documentation of any AI prompts used.

---

## References

- See [Lessons.md](Lessons.md) for detailed history of what was tried and why
- See [Implement.md](Implement.md) for code architecture and low-level details
