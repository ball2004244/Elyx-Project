# GLOSSARY.md

Canonical terminology for the Elyx Resource Allocator. Use these terms consistently across code, data, docs, and UI. Locked 2026-05-30.

---

## One-line definition

> The Resource Allocator organizes all time-related constraints into a personalized calendar that respects the member's life while still guaranteeing health activities happen at the right cadence.

---

## Core entities

- **Member** - the single person the plan is built for (Elyx uses "member", not patient/customer).
- **Action Plan** - the **input**: a priority-ordered list of activities recommended by HealthSpan AI. Priority reflects health importance.
- **Activity** - one item in the action plan, carrying the 10 fields (type, frequency, details, facilitator, location, remote-capable, prep, backups, skip-adjustment, metrics).
- **Resource Allocator** - the scheduler engine (diagram center) that maps the Action Plan onto a calendar under the 5 Constraints.
- **Personalized Plan** - the **output**: scheduled activity instances rendered as a readable calendar.

---

## The 5 Constraints

The availability/context nodes the scheduler must respect (everything in the diagram except the Action Plan input). These are constraints, NOT "pillars".

| # | Constraint | Meaning |
|---|-----------|---------|
| C1 | **Client's Schedule** | The member's own existing calendar commitments (busy/free windows). |
| C2 | **Travel Plans** | Scheduled travel windows that change the member's location or availability. |
| C3 | **Equipment** | Availability schedule for physical equipment that an activity may require. |
| C4 | **Specialists** | Availability of specialists (e.g. physicians) needed to facilitate certain activities. |
| C5 | **Allied Health** | Availability of non-doctor health professionals: physiotherapists, occupational therapists, dietitians, speech therapists, trainers. |

---

## The 3 Forces

The competing objectives the scheduler balances when placing each activity. Good scheduling = a defensible trade-off among these.

| # | Force | Meaning |
|---|-------|---------|
| F1 | **Member fit** | The plan should respect the member's schedule, preferences, and travel (Client's Schedule + Travel Plans). |
| F2 | **Resource availability** | The plan can only place an activity when the required people/equipment are actually free (Equipment + Specialists + Allied Health). |
| F3 | **Health efficacy** | The plan must preserve health intent: hit the prescribed frequency and targets in priority order, using backups/skip-adjustments rather than silently dropping activities. |

---

## Terminology pitfalls (do NOT confuse)

- **"Pillars"** is reserved for Elyx's 7 *healthspan pillars* (Diagnostics, Movement, Nutrition, Sleep, Mind, Therapies, Innovation) - these are health DOMAINS from COMPANY.md, unrelated to the diagram. The diagram's surrounding nodes are **Constraints** (+ the Action Plan input).
- **Action Plan is an input, not a constraint.** The diagram arrow points inward.
- Use **member**, not patient/customer/user.

---

## Activity field names (canonical keys)

The Activity object has **14 fields**: the 10 from the assignment + 4 added.

Used in schemas and CSV headers:

**From the assignment (10):**
`activityType`, `frequency`, `details`, `facilitator`, `location`, `remoteCapable`, `prep`, `backups`, `skipAdjustment`, `metrics`

**Added (4):**
- `id` - stable identifier (so `backups` can reference activities; instances are trackable).
- `priority` - integer health-importance rank (1 = top). An **input** from HealthSpan AI, never computed by the allocator.
- `priorityRationale` - supporting evidence for the priority. Set upstream (the LLM sampler plays HealthSpan AI). Traceability/display ONLY; the scheduler never reads it.
- `requiredEquipment` - equipment ids the activity needs (enables Constraint C3 checks).

## Activity types (enum)

`fitness` | `food` | `medication` | `therapy` | `consultation`

The assignment's two "one of the following" lists mean different things:
- The **10 fields** are attributes describing every action simultaneously (a row's columns), NOT mutually exclusive choices despite the PDF calling them "subtypes".
- The **5 activity types** above ARE mutually exclusive; `activityType` (field #1) picks exactly one.

## Action Plan shape

A multi-row table ordered by `priority`. **Each row = one action = all 14 fields.** Field #1 (`activityType`) selects one of the 5 activity types.
