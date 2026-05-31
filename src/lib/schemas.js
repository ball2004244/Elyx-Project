/**
 * @file Domain schemas for the Elyx Resource Allocator.
 *
 * Zod is used as the runtime-validation layer (the JS equivalent of Python's
 * Pydantic): each schema both validates data at runtime AND serves as the
 * single source of truth for the corresponding object shape.
 *
 * Terminology is locked in memory/GLOSSARY.md:
 *  - Action Plan  -> the INPUT (priority-ordered list of Activities)
 *  - 5 Constraints -> Client's Schedule, Travel Plans, Equipment, Specialists,
 *    Allied Health
 *  - 3 Forces      -> Member fit, Resource availability, Health efficacy
 *
 * Convention: resource pools (Equipment, Specialists, Allied Health) publish
 * the windows in which they ARE available. The member's Client Schedule and
 * Travel publish BLOCKED windows (commitments / time away).
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

/** ISO-8601 datetime string, e.g. "2026-06-01T09:00:00". */
export const IsoDateTime = z.iso.datetime({ local: true });

/** A contiguous time window [start, end). */
export const TimeWindow = z
  .object({
    start: IsoDateTime,
    end: IsoDateTime,
  })
  .refine((w) => w.start < w.end, {
    message: 'window end must be after start',
    path: ['end'],
  });

/**
 * A time window carrying a human-readable reason. Used for explainable
 * disruptions (decision b): equipment maintenance, provider leave, sick day,
 * etc. The `reason` is surfaced in the UI so a moved/skipped activity can say
 * WHY ("treadmill under maintenance"), not just that it happened.
 */
export const ReasonedWindow = z
  .object({
    start: IsoDateTime,
    end: IsoDateTime,
    reason: z.string().default(''),
  })
  .refine((w) => w.start < w.end, {
    message: 'window end must be after start',
    path: ['end'],
  });

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

/** Activity Type field (assignment field #1). */
export const ActivityType = z.enum([
  'fitness', // fitness routine / exercise (incl. eye exercise)
  'food', // food consumption
  'medication', // medication consumption
  'therapy', // sauna / ice bath
  'consultation', // consultation
]);

/** Frequency period (assignment supports daily/weekly/monthly/yearly). */
export const FrequencyPeriod = z.enum(['day', 'week', 'month', 'year']);

/**
 * Which constraint pool facilitates an activity (assignment field #4).
 *  - self        -> member does it alone, no facilitator resource needed
 *  - specialist  -> Constraint C4
 *  - alliedHealth -> Constraint C5 (physio, OT, dietitian, speech therapist,
 *    trainer)
 */
export const FacilitatorType = z.enum(['self', 'specialist', 'alliedHealth']);

/* -------------------------------------------------------------------------- */
/* Activity (one item of the Action Plan)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Frequency: "how often does this activity need to be done" (field #2).
 * e.g. { count: 3, period: 'week' } == "3 times a week".
 */
export const Frequency = z.object({
  count: z.number().int().positive(),
  period: FrequencyPeriod,
});

/** Who facilitates the activity (field #4). */
export const Facilitator = z.object({
  type: FacilitatorType,
  /** Role label, e.g. "trainer", "physiotherapist", "physician". */
  role: z.string().min(1).optional(),
  /** Optional pin to a specific resource id from the provider pool. */
  resourceId: z.string().min(1).optional(),
});

/**
 * Activity = one action in the Action Plan. Carries the 10 assignment fields
 * plus `id`, `priority`, and `priorityRationale` (13 fields total).
 *
 * Priority is an INPUT, decided upstream by HealthSpan AI, not computed here.
 * `priorityRationale` carries the supporting evidence for traceability only.
 *
 * `facilitator.role` enables role-based selection: the scheduler may pick ANY
 * available provider of that role from the bank; `facilitator.resourceId` pins
 * a specific one only when continuity matters.
 */
export const Activity = z.object({
  /** Stable identifier. */
  id: z.string().min(1),
  /** Priority = health importance; lower = higher priority (1 is top). */
  priority: z.number().int().positive(),
  /**
   * (14) Supporting evidence/rationale for the priority. Set upstream by
   * HealthSpan AI (the LLM sampler plays this role for our sample data). Used
   * for traceability/display ONLY — the scheduler never reads it.
   */
  priorityRationale: z.string().default(''),

  // (1) Activity Type that needs to be done.
  activityType: ActivityType,
  // (2) How often the activity needs to be done.
  frequency: Frequency,
  // (3) Details about the activity, e.g. "Maintain HR between 120-140".
  details: z.string().default(''),
  // (4) Who will facilitate the activity.
  facilitator: Facilitator,
  // (5) Where the activity can be done.
  location: z.string().default(''),
  // (6) Whether the activity can be facilitated remotely (e.g. video call).
  remoteCapable: z.boolean().default(false),
  // (7) Prep needed to facilitate the activity, e.g. "cook the meal".
  prep: z.string().default(''),
  // (8) Backup activities that can substitute for this one (ids/labels).
  backups: z.array(z.string()).default([]),
  // (9) Adjustments to make if the activity is skipped.
  skipAdjustment: z.string().default(''),
  // (10) Metrics to be collected from this activity.
  metrics: z.array(z.string()).default([]),
});

/** The Action Plan: priority-ordered list of Activities (the INPUT). */
export const ActionPlan = z.array(Activity);

/* -------------------------------------------------------------------------- */
/* The 5 Constraints                                                          */
/* -------------------------------------------------------------------------- */

/** C1 - Client's Schedule: the member's existing BLOCKED commitments. */
export const ClientScheduleEntry = TimeWindow.and(
  z.object({
    label: z.string().default(''),
    /**
     * 'commitment' = a routine/expected block (work, family). 'incident' = an
     * abrupt, unexpected block (sick day, urgent matter). Both block the
     * member; the distinction is for explainability (decision b).
     */
    kind: z.enum(['commitment', 'incident']).default('commitment'),
  }),
);

/** C2 - Travel Plans: BLOCKED windows when the member is away / relocates. */
export const TravelEntry = TimeWindow.and(
  z.object({
    destination: z.string().min(1),
    /** Location key for matching against activity/equipment locations. */
    location: z.string().default(''),
  }),
);

/**
 * C3 - Equipment: a physical item, the windows in which it IS available, and
 * optional reasoned downtime (maintenance) carved out of availability.
 */
export const Equipment = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  location: z.string().default(''),
  availability: z.array(TimeWindow).default([]),
  /** Reasoned blocked windows (decision b), e.g. maintenance. */
  downtime: z.array(ReasonedWindow).default([]),
});

/** C4 - Specialists: availability of specialists (e.g. physicians). */
export const Specialist = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  /** Can facilitate remotely (relaxes location/travel for remote work). */
  remoteOk: z.boolean().default(false),
  availability: z.array(TimeWindow).default([]),
  /** Reasoned blocked windows (decision b), e.g. leave, cancellation. */
  downtime: z.array(ReasonedWindow).default([]),
});

/** C5 - Allied Health: physio, OT, dietitian, speech therapist, trainer. */
export const AlliedHealthProvider = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  remoteOk: z.boolean().default(false),
  availability: z.array(TimeWindow).default([]),
  /** Reasoned blocked windows (decision b), e.g. leave, sick day. */
  downtime: z.array(ReasonedWindow).default([]),
});

/** Bundle of all constraint data for a scheduling run. */
export const Constraints = z.object({
  clientSchedule: z.array(ClientScheduleEntry).default([]),
  travel: z.array(TravelEntry).default([]),
  equipment: z.array(Equipment).default([]),
  specialists: z.array(Specialist).default([]),
  alliedHealth: z.array(AlliedHealthProvider).default([]),
});

/* -------------------------------------------------------------------------- */
/* Scheduler output                                                           */
/* -------------------------------------------------------------------------- */

/** How a scheduled instance came to be placed. */
export const PlacementKind = z.enum([
  'primary', // placed as the requested activity
  'backup', // placed via a backup substitution (field #8)
  'skipped', // could not be placed; skip-adjustment applied (field #9)
]);

/** One concrete, time-boxed occurrence in the Personalized Plan (OUTPUT). */
export const ScheduledInstance = z.object({
  activityId: z.string().min(1),
  kind: PlacementKind,
  window: TimeWindow.nullable(), // null when skipped
  facilitatorId: z.string().nullable().default(null),
  equipmentIds: z.array(z.string()).default([]),
  isRemote: z.boolean().default(false),
  metrics: z.array(z.string()).default([]),
  note: z.string().default(''), // skip-adjustment or substitution reason
  /** Raw failure reason code (see scheduler FAIL) for backup/skipped instances. */
  reason: z.string().default(''),
  /** For a backup placement: the substitute activity's id. */
  backupId: z.string().nullable().default(null),
  /** Intended day ("YYYY-MM-DD") for a skipped instance (it has no window). */
  day: z.string().nullable().default(null),
});

/** The Personalized Plan = list of scheduled instances. */
export const PersonalizedPlan = z.array(ScheduledInstance);

/* -------------------------------------------------------------------------- */
/* JSDoc typedefs (editor intellisense without TypeScript)                    */
/* -------------------------------------------------------------------------- */

/** @typedef {z.infer<typeof Activity>} Activity */
/** @typedef {z.infer<typeof Frequency>} Frequency */
/** @typedef {z.infer<typeof ReasonedWindow>} ReasonedWindow */
/** @typedef {z.infer<typeof Constraints>} Constraints */
/** @typedef {z.infer<typeof Equipment>} Equipment */
/** @typedef {z.infer<typeof Specialist>} Specialist */
/** @typedef {z.infer<typeof AlliedHealthProvider>} AlliedHealthProvider */
/** @typedef {z.infer<typeof ScheduledInstance>} ScheduledInstance */
/** @typedef {z.infer<typeof PersonalizedPlan>} PersonalizedPlan */
