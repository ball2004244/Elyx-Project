/**
 * @file Transform raw sampled activities into the final action plan, applying:
 *  - role canonicalization,
 *  - role-based de-pinning: drop facilitator.resourceId except continuity pins,
 *  - supplement consolidation into AM/PM stacks (decision D32),
 *  - two deliberately hard-but-VALID activities to exercise substitution/skip.
 *
 * Pure functions; consumed by scripts/runAggregateActionPlan.js.
 */

import { canonicalizeRole } from './resourceBank.js';

/**
 * Activities that KEEP a pinned resourceId because provider continuity matters
 * (same clinician across longitudinal reviews). Everything else becomes
 * role-based so the scheduler can pick any qualifying provider.
 */
export const CONTINUITY_PINS = {
  'act-101': 'sp-01', // quarterly longevity review — same physician
  'act-102': 'sp-01', // quarterly labs ordered by same physician
  'act-111': 'sp-04', // sleep follow-up — continuity of care
  'act-112': 'sp-03', // CGM review — same endocrinologist
};

/**
 * Two extra activities that are referentially VALID but deliberately hard to
 * schedule, so the demo visibly shows substitution and skip-adjustment firing.
 */
export const HARD_ACTIVITIES = [
  {
    id: 'act-113',
    priority: 6,
    priorityRationale:
      'Daily clinic sauna maximizes heat-adaptation benefit, but daily cadence collides with travel and clinic hours to stress-test the scheduler.',
    activityType: 'therapy',
    frequency: { count: 1, period: 'day' },
    details:
      'Daily infrared sauna at the clinic, 20 min at 55-60C; on-site only.',
    facilitator: { type: 'self' },
    location: 'Elyx clinic',
    remoteCapable: false,
    prep: 'Hydrate beforehand.',
    backups: ['act-099'],
    skipAdjustment:
      'On travel/closed days, substitute a home contrast shower (act-099).',
    metrics: ['duration_min', 'temp_c', 'hrv'],
  },
  {
    id: 'act-114',
    priority: 3,
    priorityRationale:
      'In-person coached power session requires a trainer plus the barbell rack on-site; contention here demonstrates role-based provider substitution.',
    activityType: 'fitness',
    frequency: { count: 3, period: 'week' },
    details:
      'Trainer-coached barbell power session: cleans and jumps, 5x3 explosive reps.',
    facilitator: { type: 'alliedHealth', role: 'personal trainer' },
    location: 'Elyx gym',
    remoteCapable: false,
    prep: 'Full warm-up; trainer briefed on loads.',
    backups: ['act-023', 'act-024'],
    skipAdjustment:
      'If no trainer/rack, self-perform kettlebell power work (act-023).',
    metrics: ['sets', 'reps', 'load_kg'],
  },
];

/**
 * Apply per-activity transforms (role canonicalization + de-pinning).
 * @param {Record<string, any>} a
 * @returns {Record<string, any>}
 */
export function transformActivity(a) {
  const out = { ...a };
  const f = { ...(a.facilitator ?? {}) };

  if (f.type === 'self') {
    // Self-directed: no facilitator resource is relevant for scheduling.
    delete f.role;
    delete f.resourceId;
  } else {
    f.role = canonicalizeRole(f.role);
    const pin = CONTINUITY_PINS[a.id];
    if (pin) {
      f.resourceId = pin;
    } else {
      delete f.resourceId; // role-based: pick any qualifying provider
    }
  }
  out.facilitator = f;
  return out;
}

/**
 * Daily supplement activities to consolidate into two stacks (decision D32).
 * Dose-sensitive prescriptions (statin, metformin, lisinopril, aspirin,
 * berberine) are intentionally NOT merged — they stay individual.
 */
export const SUPPLEMENT_IDS = new Set([
  'act-069', // omega-3
  'act-070', // vitamin D3
  'act-071', // CoQ10
  'act-072', // magnesium
  'act-074', // creatine
  'act-075', // vitamin K2
  'act-076', // vitamin B12
  'act-077', // ashwagandha
  'act-079', // curcumin
  'act-080', // glycine (evening)
  'act-081', // zinc
  'act-082', // psyllium
]);

/** The two consolidated supplement-stack activities. */
export const SUPPLEMENT_STACKS = [
  {
    id: 'act-201',
    priority: 4,
    priorityRationale:
      'Consolidating the morning supplement stack into one routine reflects how the member actually takes them — one organizer, once.',
    activityType: 'medication',
    frequency: { count: 1, period: 'day' },
    details:
      'Morning supplement stack: vitamin D3, vitamin K2, omega-3, CoQ10, creatine, B12, zinc (with breakfast).',
    facilitator: { type: 'self' },
    location: 'home',
    remoteCapable: false,
    prep: 'Pre-fill the AM compartment of the pill organizer.',
    backups: [],
    skipAdjustment: 'Take with the next meal the same day; never double-dose.',
    metrics: ['adherence_logged'],
  },
  {
    id: 'act-202',
    priority: 5,
    priorityRationale:
      'An evening supplement stack groups the wind-down compounds into a single before-bed routine.',
    activityType: 'medication',
    frequency: { count: 1, period: 'day' },
    details:
      'Evening supplement stack: magnesium glycinate, glycine, ashwagandha, curcumin, psyllium (with dinner / before bed).',
    facilitator: { type: 'self' },
    location: 'home',
    remoteCapable: false,
    prep: 'Pre-fill the PM compartment of the pill organizer.',
    backups: [],
    skipAdjustment:
      'Skip for the night if missed before sleep; never double-dose.',
    metrics: ['adherence_logged'],
  },
];

/**
 * Post-process the full activity list: drop consolidated supplements and append
 * the two AM/PM stacks.
 * @param {Record<string, any>[]} activities (already per-activity transformed)
 * @returns {Record<string, any>[]}
 */
export function postProcessPlan(activities) {
  const kept = activities.filter((a) => !SUPPLEMENT_IDS.has(a.id));
  return [...kept, ...SUPPLEMENT_STACKS];
}
