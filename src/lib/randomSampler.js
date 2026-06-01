/**
 * @file Advanced deterministic-random Action Plan sampler (the live UI path).
 *
 * Generates a realistic, schema-valid Action Plan WITHOUT an LLM — instant, no
 * API key, no rate limit, runs client-side. It mirrors the statistical shape of
 * the bundled `action_plan.csv` (D55): a bell-curve priority distribution and
 * per-type facilitator/location/frequency patterns profiled from that dataset,
 * drawing `details` from curated phrase pools so output is varied and reads like
 * a real concierge plan.
 *
 * Closed world (D49): every facilitator references a canonical role from the
 * fixed bank (mirrored here, since src/ may not import scripts/), so output
 * always passes `validateReferences`. The LLM sampler (`sampler.js`) is retained
 * but no longer wired to the UI (D55).
 */

import { Activity } from './schemas.js';

/* -------------------------------------------------------------------------- */
/* Seeded RNG (mulberry32) — reproducible draws, optional seed                */
/* -------------------------------------------------------------------------- */

/** Create a seeded PRNG; same seed → same plan (handy for tests/repro). */
function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a uniform random element. */
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/** Pick a key from a weighted map {value: weight}. */
function weightedPick(rng, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = rng() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

/**
 * Approximate a bell curve over 1..10 via the sum of two uniforms (triangular),
 * matching the bundled plan's clustered-mid priorities (peak ~5).
 */
function bellPriority(rng) {
  const v = Math.round(1 + 4.5 * (rng() + rng())); // 1..10, peak ~5-6
  return Math.max(1, Math.min(10, v));
}

/* -------------------------------------------------------------------------- */
/* Closed-world bank roles (mirror of scripts/resourceBank.js)                */
/* -------------------------------------------------------------------------- */

const ROLE = {
  TRAINER: 'personal trainer',
  PHYSIO: 'physiotherapist',
  DIETITIAN: 'dietitian',
  NUTRITIONIST: 'nutritionist',
  MASSAGE: 'massage therapist',
  YOGA: 'yoga instructor',
  HEALTH_COACH: 'health coach',
  LONGEVITY: 'longevity physician',
  CARDIO: 'cardiologist',
  ENDO: 'endocrinologist',
  SLEEP: 'sleep physician',
  SPORTS_MED: 'sports medicine physician',
};

/* -------------------------------------------------------------------------- */
/* Per-type content pools + distributions (profiled from action_plan.csv)     */
/* -------------------------------------------------------------------------- */

/**
 * Each type carries weighted choices for facilitator/location/period, a remote
 * probability, metric/backup/skip pools, and a list of {name, guidance} entries
 * that become `details` as "Name: guidance" (so `shortLabel` reads cleanly, D45).
 */
const TYPE_SPEC = {
  fitness: {
    facilitator: { self: 25, alliedHealth: 15, specialist: 1 },
    roles: [ROLE.TRAINER, ROLE.PHYSIO, ROLE.SPORTS_MED, ROLE.YOGA],
    location: { home: 19, 'Elyx gym': 17, outdoor: 4, 'Elyx clinic': 1 },
    period: { week: 32, month: 5, day: 4 },
    remoteP: 0.45,
    metrics: ['avg_hr', 'duration_min', 'rpe', 'distance_km', 'power_w'],
    skip: ['shift to next free day', 'swap with a rest-day mobility block'],
    items: [
      ['Zone-2 cardio', 'keep HR 120-140 for 35-45 min'],
      ['Interval run', '6x 3 min hard / 2 min easy, track pace'],
      ['Barbell back squat', '4x6 at RPE 8, progressive load'],
      ['Deadlift session', '3x5 hinge pattern, focus on bracing'],
      ['Kettlebell circuit', '20 min EMOM swings + goblet squats'],
      ['Incline treadmill walk', '40 min at 6% grade, post-meal'],
      ['Rowing intervals', '5x 500 m with 90 s rest'],
      ['Mobility flow', '15 min hips and thoracic spine'],
      ['Balance and gait drills', 'single-leg stands, tandem walk'],
      ['Grip and carry work', 'farmer carries 3x 40 m'],
      ['Indoor cycling', '45 min steady aerobic base'],
      ['Yoga strength flow', '30 min vinyasa for stability'],
      ['Sprint repeats', '8x 60 m at 90% with full recovery'],
      ['Core anti-rotation set', 'pallof press and planks'],
      ['Eye exercise routine', '20-20-20 focus shifts, 5 min'],
      ['Overhead press', '4x6 strict, brace the trunk'],
      ['Pull-up progression', '5x submaximal, controlled eccentric'],
      ['Hill repeats', '6x 45 s uphill at hard effort'],
      ['Swim laps', '30 min freestyle, steady aerobic'],
      ['Tempo run', '25 min at threshold pace'],
      ['Lunge matrix', 'forward, lateral, reverse for hips'],
      ['Loaded carries', 'suitcase and overhead, 4 rounds'],
      ['Box jumps', '5x3 for lower-body power'],
      ['Hip thrust', '4x8 for posterior chain'],
      ['Trap-bar deadlift', '4x5, joint-friendly loading'],
      ['Stationary bike intervals', '10x 1 min hard / 1 min easy'],
      ['Thoracic mobility drill', '10 min foam-roller extensions'],
      ['Sled push', '6x 20 m for leg drive'],
      ['Brisk outdoor walk', '8,000 steps at a conversational pace'],
      ['Stair climbing', '15 min continuous for conditioning'],
      ['Resistance band circuit', 'full-body on travel days'],
      ['Single-leg strength', 'split squats and step-ups, 3x8'],
    ],
  },
  food: {
    facilitator: { self: 19, alliedHealth: 5 },
    roles: [ROLE.DIETITIAN, ROLE.NUTRITIONIST],
    location: { home: 23, restaurant: 1 },
    period: { day: 12, week: 12 },
    remoteP: 0.3,
    metrics: ['protein_g', 'fiber_g', 'calories', 'adherence'],
    skip: ['log the next compliant meal', 'adjust the following day'],
    items: [
      ['Protein-forward breakfast', 'aim for 35-40 g protein'],
      ['Mediterranean lunch', 'vegetables, olive oil, legumes, fish'],
      ['Hydration target', 'drink ~2,500 ml water across the day'],
      ['Time-restricted eating', 'confine intake to a 10-hour window'],
      ['Oily fish serving', '150 g salmon or mackerel for omega-3'],
      ['Fermented food', 'a serving of yoghurt, kimchi, or kefir'],
      ['Leafy greens', 'two cups for nitrates and folate'],
      ['Limit added sugar', 'keep below 25 g for the day'],
      ['Early dinner', 'finish the last meal 3 h before bed'],
      ['Pre-workout fuel', 'easy carbs 60-90 min prior'],
      ['Post-workout protein', '30 g within an hour of training'],
      ['Weekly meal planning', 'batch-prep proteins and vegetables'],
      ['Berry and nut snack', 'polyphenols and healthy fats'],
      ['Legume serving', 'lentils or chickpeas for fibre'],
      ['Cruciferous vegetables', 'broccoli or cauliflower for sulforaphane'],
      ['Extra-virgin olive oil', 'use as the primary cooking fat'],
      ['Limit ultra-processed food', 'avoid packaged snacks today'],
      ['Green tea', 'two cups for catechins'],
      ['Electrolyte balance', 'salt and potassium around training'],
      ['Fibre target', 'reach 30-35 g across meals'],
      ['Limit alcohol', 'no more than one unit, ideally none'],
      ['Slow-eating practice', 'chew thoroughly, no screens'],
      ['Colourful plate', 'five different vegetable colours'],
      ['Bone broth or collagen', 'a serving for joint support'],
      ['Dark leafy salad', 'large bowl with olive-oil dressing'],
      ['Whole grains', 'oats or quinoa over refined carbs'],
      ['Mindful dining out', 'order grilled protein and vegetables'],
      ['Protein at every meal', 'anchor each meal around 30 g'],
      ['Magnesium-rich foods', 'pumpkin seeds, spinach, dark chocolate'],
      ['Limit late caffeine', 'none after early afternoon'],
    ],
  },
  medication: {
    facilitator: { self: 8 },
    roles: [],
    location: { home: 8 },
    period: { day: 7, week: 1 },
    remoteP: 0,
    metrics: ['adherence', 'side_effects'],
    skip: ['take at the next scheduled dose', 'do not double the dose'],
    items: [
      ['Rosuvastatin 10 mg', 'take with the evening meal'],
      ['Metformin 500 mg', 'with breakfast and dinner'],
      ['Lisinopril 10 mg', 'morning, monitor blood pressure'],
      ['Low-dose aspirin', '81 mg with food'],
      ['Morning supplement stack', 'vitamin D3, K2, omega-3, magnesium'],
      ['Evening supplement stack', 'creatine, zinc, glycine'],
      ['Berberine 500 mg', 'before the largest carbohydrate meal'],
      ['Vitamin B12', 'sublingual, morning'],
      ['Omega-3 fish oil', '2 g EPA/DHA with a meal'],
      ['Vitamin D3', '2,000 IU with a fat-containing meal'],
      ['Magnesium glycinate', '300 mg in the evening for sleep'],
      ['Creatine monohydrate', '5 g daily, timing flexible'],
      ['Ezetimibe 10 mg', 'adjunct lipid control, evening'],
      ['Omeprazole 20 mg', 'before breakfast if prescribed'],
      ['Vitamin K2', 'with the D3 dose for arterial health'],
      ['Probiotic capsule', 'morning, on an empty stomach'],
      ['CoQ10 100 mg', 'with a meal, supports statin use'],
      ['Ashwagandha 600 mg', 'evening for stress modulation'],
      ['Zinc 15 mg', 'with food to avoid nausea'],
      ['Folate and B-complex', 'morning with water'],
    ],
  },
  therapy: {
    facilitator: { self: 13, alliedHealth: 6 },
    roles: [ROLE.MASSAGE, ROLE.PHYSIO],
    location: { 'Elyx clinic': 11, home: 8 },
    period: { week: 15, month: 2, day: 2 },
    remoteP: 0.15,
    metrics: ['session_min', 'temperature_c', 'recovery_score'],
    skip: ['reschedule within the week', 'substitute a home modality'],
    items: [
      ['Infrared sauna', '20 min at 60-70 C for recovery'],
      ['Cold plunge', '3 min at 10-12 C post-training'],
      ['Contrast shower', 'alternate hot/cold to close the day'],
      ['Deep-tissue massage', '50 min lower-body focus'],
      ['Guided breathwork', '10 min box breathing'],
      ['Foam rolling', '15 min full-body release'],
      ['Sleep wind-down', 'dim lights and screens 60 min before bed'],
      ['Myofascial release', 'massage gun on calves and quads'],
      ['Steam room session', '15 min for circulation and relaxation'],
      ['Sports massage', '45 min focused on tight areas'],
      ['Lymphatic drainage', '40 min gentle massage'],
      ['Stretching session', '20 min static holds post-workout'],
      ['Meditation', '15 min focused-attention practice'],
      ['Yoga nidra', '25 min guided deep relaxation'],
      ['Compression boots', '20 min for venous return'],
      ['Hot/cold contrast bath', 'clinic protocol for recovery'],
      ['Acupuncture', '45 min for tension and recovery'],
      ['Red-light therapy', '15 min panel session'],
      ['Nasal breathing drills', '10 min to improve CO2 tolerance'],
      ['Grounding walk', '15 min barefoot outdoors'],
      ['Percussion therapy', 'massage gun on upper back'],
      ['Float tank', '60 min sensory-deprivation recovery'],
      ['Mobility and stretch', '20 min hips and shoulders'],
      ['Gratitude journaling', '5 min wind-down before sleep'],
      ['Progressive muscle relaxation', '15 min before bed'],
      ['Sunlight exposure', '10 min morning light for circadian rhythm'],
      ['Trigger-point release', 'lacrosse ball on glutes and feet'],
      ['Restorative yoga', '30 min gentle supported poses'],
    ],
  },
  consultation: {
    facilitator: { specialist: 9, alliedHealth: 3 },
    roles: [
      ROLE.LONGEVITY,
      ROLE.CARDIO,
      ROLE.ENDO,
      ROLE.SLEEP,
      ROLE.HEALTH_COACH,
    ],
    location: { 'Elyx clinic': 8, 'video call': 4 },
    period: { year: 9, month: 3 },
    remoteP: 0.5,
    metrics: ['findings', 'plan_updates'],
    skip: ['rebook the next available slot', 'convert to a remote review'],
    items: [
      ['Longevity physician review', 'quarterly labs and plan calibration'],
      ['Cardiology assessment', 'imaging-based risk stratification'],
      ['Endocrinology review', 'metabolic markers and dosing'],
      ['Sleep study review', 'interpret overnight diagnostics'],
      ['Health coaching check-in', 'goals, barriers, adherence'],
      ['Body composition scan', 'DEXA lean mass and bone density'],
      ['VO2 max test', 'maximal cardiorespiratory benchmark'],
      ['Physiotherapy assessment', 'movement screen and corrective plan'],
      ['Bloodwork panel review', 'lipids, glucose, inflammation markers'],
      ['Nutrition consult', 'dietitian review of intake and targets'],
      ['Dermatology skin check', 'annual full-body screening'],
      ['Cognitive assessment', 'baseline memory and processing tests'],
      ['Eye examination', 'vision and retinal health screening'],
      ['Dental and oral review', 'cleaning and periodontal check'],
      ['CGM data review', 'interpret continuous glucose trends'],
      ['Hormone panel review', 'endocrine markers and optimization'],
      ['Gait and posture analysis', 'biomechanics screen with physio'],
      ['Stress and HRV review', 'autonomic balance and recovery'],
      ['Genetic risk consult', 'review polygenic risk and actions'],
      ['Gut microbiome review', 'interpret stool panel results'],
      ['Cardiac stress test', 'treadmill ECG under supervision'],
      ['Annual physical exam', 'comprehensive head-to-toe review'],
    ],
  },
};

/** Roles that can plausibly be delivered remotely. */
const REMOTE_ROLES = new Set([
  ROLE.TRAINER,
  ROLE.DIETITIAN,
  ROLE.NUTRITIONIST,
  ROLE.HEALTH_COACH,
  ROLE.LONGEVITY,
  ROLE.ENDO,
  ROLE.SLEEP,
  ROLE.YOGA,
  ROLE.PHYSIO,
]);

/** Frequency count ranges per period (realistic cadence). */
const COUNT_RANGE = {
  day: [1, 3],
  week: [1, 5],
  month: [1, 3],
  year: [1, 4],
};

export { TYPE_SPEC, bellPriority };

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

/** Default type mix (fractions), matching the bundled plan's shape. */
export const DEFAULT_DISTRIBUTION = {
  fitness: 0.4,
  food: 0.2,
  medication: 0.1,
  therapy: 0.18,
  consultation: 0.12,
};

/**
 * Turn a total + fractional distribution into exact per-type integer counts
 * that sum to the total (largest-remainder). Zero-weight types are omitted.
 * @param {number} total
 * @param {Record<string, number>} distribution
 * @returns {Record<string, number>}
 */
export function typeCounts(total, distribution = DEFAULT_DISTRIBUTION) {
  const types = Object.keys(TYPE_SPEC).filter(
    (t) => (distribution[t] ?? 0) > 0,
  );
  const sum = types.reduce((n, t) => n + distribution[t], 0) || 1;
  const raw = types.map((t) => ({ t, exact: (distribution[t] / sum) * total }));
  const counts = {};
  let assigned = 0;
  for (const { t, exact } of raw) {
    counts[t] = Math.max(1, Math.floor(exact));
    assigned += counts[t];
  }
  let rem = total - assigned;
  const byFrac = [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1));
  let i = 0;
  while (rem > 0 && byFrac.length) {
    counts[byFrac[i % byFrac.length].t] += 1;
    rem -= 1;
    i += 1;
  }
  while (rem < 0) {
    const big = types.sort((a, b) => counts[b] - counts[a])[0];
    if (counts[big] <= 1) break;
    counts[big] -= 1;
    rem += 1;
  }
  return counts;
}

/** Build one activity of `type` with the given id, drawing from the pools. */
function makeActivity(rng, type, id, item) {
  const spec = TYPE_SPEC[type];
  const facType = weightedPick(rng, spec.facilitator);
  const facilitator = { type: facType };
  if (facType !== 'self' && spec.roles.length) {
    facilitator.role = pick(rng, spec.roles);
  }
  const location = weightedPick(rng, spec.location);
  const period = weightedPick(rng, spec.period);
  const [name, guidance] = item;

  // Per-day cadence > 1 only makes sense for activities that genuinely recur
  // intraday: meals, meds/supplements, and a few light "reminder" movements
  // (eye exercise, posture/mobility breaks, breathwork). A strength session,
  // cardio bout, massage, or consultation is once-per-day at most — so a
  // "3x/day overhead press" must never happen.
  const intradayOk =
    type === 'food' ||
    type === 'medication' ||
    /\b(eye exercise|mobility|posture|breath|stretch|hydration|walk)\b/i.test(
      name,
    );
  let [lo, hi] = COUNT_RANGE[period];
  if (period === 'day' && !intradayOk) {
    lo = 1;
    hi = 1;
  }
  const count = lo + Math.floor(rng() * (hi - lo + 1));

  // Remote only makes sense for facilitated activities with a remote-able role.
  const canRemote =
    facType !== 'self' &&
    (!facilitator.role || REMOTE_ROLES.has(facilitator.role));
  const remoteCapable = canRemote && rng() < spec.remoteP;

  // Two metrics, no duplicates.
  const m1 = pick(rng, spec.metrics);
  let m2 = pick(rng, spec.metrics);
  const metrics = m1 === m2 ? [m1] : [m1, m2];

  return {
    id,
    priority: bellPriority(rng),
    priorityRationale: `${name} supports the member's longevity goals.`,
    activityType: type,
    frequency: { count, period },
    details: `${name}: ${guidance}`,
    facilitator,
    location,
    remoteCapable,
    prep: '',
    backups: [],
    skipAdjustment: pick(rng, spec.skip),
    metrics,
  };
}

/**
 * Sample a full Action Plan without an LLM (D55). Draws `total` activities split
 * by `distribution`, mirroring the bundled dataset's statistics, then sorts by
 * the bell-curve priority and renumbers ids contiguously (act-001..). Every row
 * is Zod-validated; output references only canonical bank roles.
 *
 * @param {{ total?: number, distribution?: Record<string, number>, seed?: number }} [opts]
 * @returns {import('./schemas.js').Activity[]}
 */
/**
 * Natural qualifiers appended to overflow items (when a type's count exceeds its
 * pool), so a repeated activity reads like a real progression rather than
 * "(variant 2)". Cycled by overflow round.
 */
const VARIANT_QUALIFIER = [
  'progression block',
  'deload week',
  'tempo focus',
  'endurance focus',
  'technique focus',
];

export function sampleRandomActionPlan({
  total = 100,
  distribution = DEFAULT_DISTRIBUTION,
  seed,
} = {}) {
  const rng = makeRng(seed);
  const counts = typeCounts(total, distribution);
  const out = [];

  for (const [type, n] of Object.entries(counts)) {
    const items = TYPE_SPEC[type].items;
    // Shuffle the item pool so each draw is varied. If n exceeds the pool (only
    // at high totals for the dominant type), cycle and append a natural
    // qualifier so details stay distinct and still read realistically.
    const order = [...items].sort(() => rng() - 0.5);
    for (let i = 0; i < n; i++) {
      let item = order[i % order.length];
      if (i >= order.length) {
        const round = Math.floor(i / order.length) - 1;
        const qualifier = VARIANT_QUALIFIER[round % VARIANT_QUALIFIER.length];
        const [name, g] = item;
        item = [`${name} (${qualifier})`, g];
      }
      out.push(makeActivity(rng, type, 'tmp', item));
    }
  }

  // Sort by priority (clustered/tied is realistic) then assign contiguous ids.
  out.sort((a, b) => a.priority - b.priority);
  const plan = out.map((a, i) => ({
    ...a,
    id: `act-${String(i + 1).padStart(3, '0')}`,
  }));

  // Validate every row; drop any that somehow fail (defensive — should be none).
  return plan
    .map((a) => Activity.safeParse(a))
    .filter((r) => r.success)
    .map((r) => r.data);
}
