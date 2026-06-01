/**
 * @file LLM data sampler for the Elyx Resource Allocator.
 *
 * The sampler plays the role of HealthSpan AI (Action Plan, incl. `priority` +
 * `priorityRationale`) and an operations planner (the 5 Constraints), producing
 * sample data that validates against `src/lib/schemas.js`.
 *
 * Design — bring-your-own-key (BYOK):
 *   This module is PROVIDER-AGNOSTIC. The caller injects an `invokeLLM`
 *   function
 *   of shape (prompt: string) => Promise<string>. The sampler never imports an
 *   SDK, never reads an API key, and never makes a network call itself. That
 *   keeps the future "user brings their own key/provider" goal a thin adapter
 *   around this core (Dependency Inversion).
 *
 * Output contract:
 *   Every artifact is parsed through Zod before being returned, so sampler
 *   output and scheduler input can never drift. Invalid output throws.
 *
 * The exact prompt text below IS the source of truth for the "prompts used"
 * submission artifact; `src/prompts/sampler.md` documents this module.
 */

import { jsonrepair } from 'jsonrepair';
import { Activity, ActionPlan, Constraints } from './schemas.js';

/* -------------------------------------------------------------------------- */
/* The closed bank (mirror of scripts/resourceBank.js)                        */
/*                                                                            */
/* src/ may not import scripts/, so the canonical ids/roles the sampled plan  */
/* MUST reference are mirrored here as prompt text (D49: the LLM samples the   */
/* action plan that references the fixed bank; it never invents resources).   */
/* Keep in sync with scripts/resourceBank.js.                                 */
/* -------------------------------------------------------------------------- */

/** Human-readable bank summary embedded in the action-plan prompt. */
export const BANK_REFERENCE = `Equipment (eq-01..12): treadmill, indoor bike, rowing ergometer, barbell & rack,
adjustable dumbbells, kettlebell set, infrared sauna, ice bath/plunge, yoga mat,
HR chest strap, massage gun, resistance bands (at "Elyx gym", "Elyx clinic", or "home").
Specialists (sp-01..05) by role: longevity physician, cardiologist, endocrinologist,
sleep physician, sports medicine physician.
Allied health (ah-01..09) by role: personal trainer (x2), physiotherapist (x2),
dietitian, nutritionist, massage therapist, yoga instructor, health coach.`;

/** Canonical facilitator roles the sampled plan may reference. */
export const BANK_ROLES = [
  'personal trainer',
  'physiotherapist',
  'dietitian',
  'nutritionist',
  'massage therapist',
  'yoga instructor',
  'health coach',
  'longevity physician',
  'cardiologist',
  'endocrinologist',
  'sleep physician',
  'sports medicine physician',
];

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

/** @typedef {(prompt: string) => Promise<string>} InvokeLLM */

/**
 * @typedef {object} SamplerConfig
 * @property {string} horizonStart  ISO date (inclusive), e.g. "2026-06-01".
 * @property {string} horizonEnd    ISO date (inclusive), e.g. "2026-08-31".
 * @property {number} activityCount  Minimum number of activities to generate.
 * @property {Record<string, number>} distribution  activityType -> fraction.
 */

/** @type {SamplerConfig} */
export const DEFAULT_SAMPLER_CONFIG = {
  horizonStart: '2026-06-01',
  horizonEnd: '2026-08-31',
  activityCount: 100,
  distribution: {
    fitness: 0.4,
    food: 0.2,
    medication: 0.15,
    therapy: 0.15,
    consultation: 0.1,
  },
};

/* -------------------------------------------------------------------------- */
/* Prompt builders (source of truth for "prompts used")                       */
/* -------------------------------------------------------------------------- */

/** Shared context prepended to every prompt. */
export const sharedContext = (
  cfg,
) => `You are generating realistic sample data for "Elyx", a Singapore-based concierge
longevity / healthspan service. The member is a single high-net-worth individual
on a personalized healthspan program. Data must be clinically plausible,
internally consistent, and realistic for a concierge setting (private trainers,
dietitians, physiotherapists, physicians, on-site and home equipment, frequent
travel).

Domain rules:
- An activity's activityType is exactly one of: fitness | food | medication | therapy | consultation.
- "therapy" means recovery modalities like sauna or ice bath.
- "consultation" means a session with a specialist or allied-health provider.
- Output STRICT JSON only. No markdown, no comments, no trailing commas.
- All datetimes are local ISO-8601 WITHOUT timezone suffix, e.g. "2026-06-01T09:00:00".
- The program horizon is ${cfg.horizonStart} to ${cfg.horizonEnd} inclusive.`;

/**
 * The per-activity field contract, shared by the whole-plan and per-type
 * prompts (DRY). Interpolates the canonical bank roles.
 */
export const ACTIVITY_FIELD_SPEC = `Each object MUST have EXACTLY these fields (no others):
- id: string, unique within YOUR array, format "act-001", "act-002", ... (zero-padded).
- priority: integer >= 1. Lower = more important. Realistic priorities CLUSTER and
  TIE (many 4s, 5s, 6s) like a care team tiering importance — not a strict 1..N rank.
- priorityRationale: string. One evidence-backed clause explaining the priority
  (e.g. "Elevated ApoB and family CVD history make lipid management top priority").
  IMPORTANT: keep this to ONE clause with NO commas if possible (it is a CSV field);
  prefer "—" or "and" over commas.
- activityType: one of fitness | food | medication | therapy | consultation.
- frequency: object { count: integer >= 1, period: "day"|"week"|"month"|"year" }.
- details: string. MUST LEAD WITH A SHORT NAME, then guidance after a colon, e.g.
  "Zone-2 cardio: keep HR 120-140 for 40 min" or "Rosuvastatin 10 mg: take with the
  evening meal". The UI shows the part before the first colon/comma as a label, so the
  FIRST clause must read as a name, never as a fragment like "When dining out".
- facilitator: object {
    type: "self" | "specialist" | "alliedHealth",
    role: string — REQUIRED unless type is "self". Use ONLY these canonical roles:
      ${BANK_ROLES.join(', ')}.
    resourceId: OMIT unless continuity matters; then use a real id ("sp-01".."sp-05",
      "ah-01".."ah-09"). Do NOT pin equipment here.
  }
  Use type "self" for anything the member does ALONE (medication, most food, home
  workouts, breathwork). Reserve "specialist"/"alliedHealth" for sessions that truly
  need a booked person.
- location: one of "home" | "Elyx gym" | "Elyx clinic" | "outdoor". Equipment is a
  VENUE-level constraint: gym/clinic activities are checked against venue hours, so
  put gym-bound work at "Elyx gym" and sauna/ice-bath at "Elyx clinic".
- remoteCapable: boolean. true ONLY if a facilitator could run it over video.
- prep: string. What must happen beforehand, else "".
- backups: array of strings. Prefer SHORT TEXT LABELS of substitute activities
  (e.g. "outdoor walk"); if you reference another activity by id, it must be an id
  from THIS array. [] if none.
- skipAdjustment: string. What to do if skipped (e.g. "shift to next free day"). May be "".
- metrics: array of strings (e.g. ["avg_hr","duration_min"]). [] if none.`;

/** Realism rules shared by the whole-plan and per-type prompts. */
export const REALISM_RULES = `Realism rules (model the member's LIVED experience, not a granular spec):
- CONSOLIDATE supplements. Do NOT emit one activity per pill. Use at most a "Morning
  supplement stack" and an "Evening supplement stack" (list compounds in details).
  Keep ONLY dose-sensitive prescriptions separate (statin, metformin, BP med, aspirin).
- CLASSIFICATION (critical, learned the hard way): an activity is an EVENT (contends
  for a booked slot, counts against a daily cap) ONLY if it needs a scarce PERSON or
  VENUE — i.e. facilitator is specialist/alliedHealth OR location is "Elyx gym"/"Elyx
  clinic". A self-administered, home/outdoor item must use type "self" so it is NEVER
  capped/skipped, at ANY frequency. Do NOT attach a nominal coach/facilitator to a
  daily self-logging or dietary habit — that wrongly turns it into an appointment.
- Dietary/lifestyle PRINCIPLES with no clock time (sugar cap, olive oil as main fat,
  meal timing, hydration target) are fine — model them as low-frequency "self" food
  items with a clear NAME-led details string; do not over-specify a time.
- A realistic day should have ~8-12 scheduled touchpoints, not 30+.
- Vary frequencies realistically (daily meds, 3x/week training, monthly/quarterly consults).`;

/** Closed-world clause shared by both prompts. */
export const CLOSED_WORLD_CLAUSE = `Closed world — reference the FIXED resource bank, do NOT invent resources or roles:
${BANK_REFERENCE}`;

/** Prompt 1 — whole Action Plan in one call (>= activityCount, 13 fields). */
export const buildActionPlanPrompt = (cfg) => {
  const dist = Object.entries(cfg.distribution)
    .map(([t, f]) => `~${Math.round(f * 100)}% ${t}`)
    .join(', ');
  return `${sharedContext(cfg)}

Generate an Action Plan: a JSON array of >= ${cfg.activityCount} activity objects,
ordered by priority (priority 1 = most important to the member's health).

${ACTIVITY_FIELD_SPEC}

${CLOSED_WORLD_CLAUSE}

${REALISM_RULES}

Distribution guidance for the >= ${cfg.activityCount} activities: ${dist}.
- Return ONLY the JSON array. No markdown, no prose, no trailing commas.`;
};

/**
 * Bucket prompt (D54): ask for several type-chunks in ONE call, each with an
 * EXACT count. Bucketing keeps the deterministic mix + diversity while cutting
 * request count. When a type is SPLIT across buckets (part/of), each chunk is
 * asked for a DIFFERENT slice of that type's space so the parallel calls don't
 * converge on the same items (which dedupe would then discard).
 * @param {SamplerConfig} cfg
 * @param {{ type: string, count: number, part: number, of: number }[]} bucket
 */
export const buildBucketActionPlanPrompt = (cfg, bucket) => {
  const lines = bucket
    .map(({ type, count, part, of }) => {
      const slice =
        of > 1
          ? ` — these are SET ${part} OF ${of} for "${type}"; cover DIFFERENT ${type} sub-areas than the other sets (no overlap)`
          : '';
      return `- EXACTLY ${count} distinct "${type}" activities${slice}`;
    })
    .join('\n');
  const total = bucket.reduce((n, c) => n + c.count, 0);
  return `${sharedContext(cfg)}

Generate a JSON array of EXACTLY ${total} activities with this per-type breakdown:
${lines}

Each object's activityType MUST be one of the types listed above, and the counts
per type MUST match exactly. Make the activities genuinely different from one
another — vary modality, target, cadence, facilitator, and venue. NO
near-duplicates and NO repeated names.

${ACTIVITY_FIELD_SPEC}

${CLOSED_WORLD_CLAUSE}

${REALISM_RULES}

- Return ONLY the JSON array of ${total} activities. No markdown, no prose.`;
};

/**
 * Per-type prompt (D52): ask for EXACTLY `count` DISTINCT activities of ONE
 * type. Retained for single-type use; the sampler now batches via buckets.
 * @param {SamplerConfig} cfg
 * @param {string} type   one activityType
 * @param {number} count  exact number of activities to generate
 */
export const buildTypeActionPlanPrompt = (cfg, type, count) => `${sharedContext(
  cfg,
)}

Generate EXACTLY ${count} DISTINCT "${type}" activities as a JSON array. Every
object's activityType MUST be "${type}". Make them genuinely different from one
another — vary the modality, target, cadence, facilitator, and venue. NO
near-duplicates and NO repeated names.

${ACTIVITY_FIELD_SPEC}

${CLOSED_WORLD_CLAUSE}

${REALISM_RULES}

- Return ONLY the JSON array of ${count} "${type}" activities.`;

/** Prompt 2 — resource pools (Equipment, Specialists, Allied Health). */
export const buildResourcePoolsPrompt = (cfg) => `${sharedContext(cfg)}

Generate the resource pools that activities depend on, as a single JSON object:
{ "equipment": [...], "specialists": [...], "alliedHealth": [...] }

equipment[]:   { id "eq-01"..., name, location, availability: TimeWindow[] }
specialists[]: { id "sp-01"..., name, role, remoteOk: boolean, availability: TimeWindow[] }
alliedHealth[]:{ id "ah-01"..., name, role, remoteOk: boolean, availability: TimeWindow[] }
TimeWindow = { start: ISO-8601 local, end: ISO-8601 local }, end > start.

Rules:
- These are AVAILABILITY windows (when the resource IS free), across ${cfg.horizonStart}..${cfg.horizonEnd}.
- Provide realistic recurring availability (e.g. trainer free Mon/Wed/Fri 07:00-12:00) as many concrete windows.
- Cover every id referenced by the Action Plan's requiredEquipment and facilitator.resourceId.
  Roles must match (a "physiotherapist" activity maps to an alliedHealth provider with that role).
- ~8-12 equipment, ~4-6 specialists, ~5-8 allied-health providers.
- Return ONLY the JSON object.`;

/** Prompt 3 — member context (Client's Schedule + Travel). */
export const buildMemberContextPrompt = (cfg) => `${sharedContext(cfg)}

Generate the member's own context as a single JSON object:
{ "clientSchedule": [...], "travel": [...] }

clientSchedule[]: { start, end, label }                  // BLOCKED commitments
travel[]:         { start, end, destination, location }  // BLOCKED travel windows

Rules:
- These are BLOCKED windows (member is NOT available), across ${cfg.horizonStart}..${cfg.horizonEnd}.
- clientSchedule: realistic recurring commitments (work blocks, family time, meetings);
  do not fill nights. ~30-60 entries.
- travel: 2-4 trips of 2-7 days each. During travel, on-site equipment and non-remote
  facilitators are unusable; only remote-capable activities can still occur.
- Return ONLY the JSON object.`;

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort extraction of a JSON value from an LLM response: handles raw
 * JSON,
 * ```json fenced blocks, and surrounding prose by slicing to the outermost
 * bracket pair.
 * @param {string} text
 * @returns {unknown}
 */
export function extractJson(text) {
  if (typeof text !== 'string') {
    throw new TypeError('LLM response must be a string');
  }
  let s = text.trim();

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  try {
    return JSON.parse(s);
  } catch {
    // Fall back to the outermost array/object span.
    const firstArr = s.indexOf('[');
    const firstObj = s.indexOf('{');
    const start =
      firstArr === -1
        ? firstObj
        : firstObj === -1
          ? firstArr
          : Math.min(firstArr, firstObj);
    const open = s[start];
    const close = open === '[' ? ']' : '}';
    const end = s.lastIndexOf(close);
    if (start === -1 || end === -1 || end < start) {
      throw new SyntaxError('No JSON value found in LLM response');
    }
    const span = s.slice(start, end + 1);
    try {
      return JSON.parse(span);
    } catch {
      // Last resort: repair malformed/truncated LLM JSON (D50) — fixes trailing
      // commas, unquoted keys, smart quotes, and unterminated tails.
      return JSON.parse(jsonrepair(span));
    }
  }
}

/**
 * Sample the Action Plan only (strict: throws if ANY row is invalid).
 * @param {{ invokeLLM: InvokeLLM, config?: SamplerConfig }} opts
 * @returns {Promise<import('./schemas.js').Activity[]>}
 */
export async function sampleActionPlan({
  invokeLLM,
  config = DEFAULT_SAMPLER_CONFIG,
}) {
  const raw = await invokeLLM(buildActionPlanPrompt(config));
  return ActionPlan.parse(extractJson(raw));
}

/** Common LLM aliases for the frequency period → canonical enum. */
const PERIOD_ALIASES = {
  daily: 'day',
  day: 'day',
  days: 'day',
  weekly: 'week',
  week: 'week',
  weeks: 'week',
  biweekly: 'week',
  fortnightly: 'week',
  monthly: 'month',
  month: 'month',
  months: 'month',
  quarterly: 'month',
  quarter: 'month',
  yearly: 'year',
  annually: 'year',
  annual: 'year',
  year: 'year',
  years: 'year',
};

/**
 * Best-effort normalization of a raw LLM activity row toward the schema, BEFORE
 * validation — recovers rows the model got slightly wrong (e.g. period
 * "daily"→"day") instead of dropping them. Pure; returns a new object.
 * @param {any} row
 * @returns {any}
 */
export function normalizeActivityRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  if (out.frequency && typeof out.frequency === 'object') {
    const f = { ...out.frequency };
    if (typeof f.period === 'string') {
      const key = f.period.trim().toLowerCase();
      if (PERIOD_ALIASES[key]) f.period = PERIOD_ALIASES[key];
    }
    if (typeof f.count === 'string' && f.count.trim() !== '') {
      const n = Number(f.count);
      if (Number.isFinite(n)) f.count = n;
    }
    out.frequency = f;
  }
  // Coerce a stringified priority ("3") to a number.
  if (typeof out.priority === 'string' && out.priority.trim() !== '') {
    const n = Number(out.priority);
    if (Number.isFinite(n)) out.priority = n;
  }
  return out;
}

/**
 * Parse an LLM action-plan response LENIENTLY: normalize then validate each row
 * on its own and DROP the few that still fail rather than rejecting the whole
 * batch (D50). LLMs occasionally emit one bad enum/field in an otherwise good
 * ~100-row plan; losing 2-3 rows beats losing all 100. Mirrors
 * `loadActivities`' graceful CSV path. Throws only if too few rows survive.
 *
 * @param {string} raw  the LLM response text
 * @param {number} [minKept=1]  minimum valid rows required, else throw
 * @returns {{ activities: import('./schemas.js').Activity[],
 *   errors: { index: number, message: string }[] }}
 */
export function parseActionPlanLenient(raw, minKept = 1) {
  const value = extractJson(raw);
  if (!Array.isArray(value)) {
    throw new TypeError('Action plan response is not a JSON array');
  }
  const activities = [];
  const errors = [];
  value.forEach((row, index) => {
    const result = Activity.safeParse(normalizeActivityRow(row));
    if (result.success) {
      activities.push(result.data);
    } else {
      errors.push({
        index,
        message: result.error.issues[0]?.message ?? 'invalid',
      });
    }
  });
  if (activities.length < minKept) {
    throw new Error(
      `Only ${activities.length} valid activities parsed (needed ${minKept})`,
    );
  }
  return { activities, errors };
}

/**
 * Sample the Action Plan leniently: returns the valid rows + a per-row error
 * list. Use this for live/untrusted LLM output where a few bad rows shouldn't
 * sink the whole plan.
 * @param {{ invokeLLM: InvokeLLM, config?: SamplerConfig, minKept?: number }} opts
 * @returns {Promise<{ activities: import('./schemas.js').Activity[],
 *   errors: { index: number, message: string }[] }>}
 */
export async function sampleActionPlanLenient({
  invokeLLM,
  config = DEFAULT_SAMPLER_CONFIG,
  minKept = 1,
}) {
  const raw = await invokeLLM(buildActionPlanPrompt(config));
  return parseActionPlanLenient(raw, minKept);
}

/* -------------------------------------------------------------------------- */
/* Per-type parallel sampling (D52)                                           */
/* -------------------------------------------------------------------------- */

/** Activity types, in canonical order. */
export const ACTIVITY_TYPES = [
  'fitness',
  'food',
  'medication',
  'therapy',
  'consultation',
];

/**
 * Turn a target total + fractional distribution into an EXACT integer count per
 * type that sums to the total (largest-remainder method, so rounding never
 * drops or adds a row). Types with a positive fraction get at least 1.
 * @param {number} total
 * @param {Record<string, number>} distribution  type -> fraction (need not sum to 1)
 * @returns {Record<string, number>}
 */
export function computeTypeCounts(total, distribution) {
  const types = ACTIVITY_TYPES.filter((t) => (distribution[t] ?? 0) > 0);
  const sum = types.reduce((n, t) => n + distribution[t], 0) || 1;

  const raw = types.map((t) => ({ t, exact: (distribution[t] / sum) * total }));
  const counts = {};
  let assigned = 0;
  for (const { t, exact } of raw) {
    counts[t] = Math.max(1, Math.floor(exact));
    assigned += counts[t];
  }
  // Distribute the remainder by largest fractional part.
  let remainder = total - assigned;
  const byFrac = [...raw].sort(
    (a, b) => (b.exact % 1) - (a.exact % 1) || b.exact - a.exact,
  );
  let i = 0;
  while (remainder > 0 && byFrac.length) {
    counts[byFrac[i % byFrac.length].t] += 1;
    remainder -= 1;
    i += 1;
  }
  // If flooring overshot (rare), trim from the largest counts.
  while (remainder < 0) {
    const big = types.sort((a, b) => counts[b] - counts[a])[0];
    if (counts[big] <= 1) break;
    counts[big] -= 1;
    remainder += 1;
  }
  return counts;
}

/**
 * Pack per-type counts into calls (D54), capping each call at `maxPerBucket`
 * activities so no single call truncates (a ~28-row call hit the completion
 * cap; ~21 rows is safe). A large type is SPLIT into near-equal chunks
 * (fitness 28, cap 21 → 14+14); chunks are then first-fit-decreasing bin-packed
 * so small types share a call (14+7, 11+10). Two chunks of the SAME type never
 * share a call. Split chunks carry { part, of } so the prompt can ask each for
 * a DIFFERENT slice (avoids the convergence that would dedupe them away).
 * Exact counts are always preserved.
 * @param {Record<string, number>} counts  type -> exact count
 * @param {number} maxPerBucket  max activities per call
 * @returns {{ type: string, count: number, part: number, of: number }[][]}
 *   array of buckets; each bucket is a list of type-chunks
 */
export function bucketTypeCounts(counts, maxPerBucket = 21) {
  const cap = Math.max(1, maxPerBucket);

  // 1. Split each type into near-equal chunks of size <= cap.
  const chunks = [];
  for (const [type, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const of = Math.ceil(count / cap);
    const base = Math.floor(count / of);
    const extra = count - base * of; // first `extra` chunks get +1
    for (let i = 0; i < of; i++) {
      const c = base + (i < extra ? 1 : 0);
      if (c > 0) chunks.push({ type, count: c, part: i + 1, of });
    }
  }

  // 2. First-fit-decreasing into bins of capacity `cap`, never repeating a type
  //    within a bin (so a split type lands in distinct calls).
  chunks.sort((a, b) => b.count - a.count);
  const bins = [];
  for (const ch of chunks) {
    let placed = false;
    for (const bin of bins) {
      const load = bin.reduce((n, c) => n + c.count, 0);
      if (load + ch.count <= cap && !bin.some((c) => c.type === ch.type)) {
        bin.push(ch);
        placed = true;
        break;
      }
    }
    if (!placed) bins.push([ch]);
  }
  return bins;
}

/** Normalize a details string for duplicate detection (D52). */
function dedupeKey(activity) {
  const head = String(activity.details || '')
    .split(/[,;:.]/)[0]
    .trim()
    .toLowerCase();
  return `${activity.activityType}|${head}`;
}

/**
 * Merge per-type activity batches into one Action Plan (D52):
 *  1. dedupe by (type + normalized first-clause) — drops cross/within-batch repeats,
 *  2. renumber ids contiguously act-001.., remapping each batch's internal
 *     `backups` id references to the new ids (label backups pass through),
 *  3. sort by priority (clustered/tied is realistic; scheduler re-sorts anyway).
 * @param {import('./schemas.js').Activity[][]} batches
 * @returns {import('./schemas.js').Activity[]}
 */
export function mergeActionPlanBatches(batches) {
  const merged = [];
  const seen = new Set();

  for (const batch of batches) {
    // Local-id → new-id map for THIS batch (backups reference local ids).
    const localIds = new Set(batch.map((a) => a.id));
    for (const activity of batch) {
      const key = dedupeKey(activity);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ activity, localIds });
    }
  }

  // Sort by priority first so id order roughly follows importance.
  merged.sort(
    (a, b) =>
      a.activity.priority - b.activity.priority ||
      a.activity.id.localeCompare(b.activity.id),
  );

  // Assign new contiguous ids; build a per-entry old→new map keyed by the
  // entry's own batch so we can remap backups that point within that batch.
  const newIdByEntry = merged.map(
    (_, i) => `act-${String(i + 1).padStart(3, '0')}`,
  );
  // For backup remap we need: within a batch, oldLocalId -> newId. Build that.
  const remapByBatch = new Map();
  merged.forEach((entry, i) => {
    if (!remapByBatch.has(entry.localIds)) remapByBatch.set(entry.localIds, {});
    remapByBatch.get(entry.localIds)[entry.activity.id] = newIdByEntry[i];
  });

  return merged.map((entry, i) => {
    const remap = remapByBatch.get(entry.localIds);
    const backups = (entry.activity.backups ?? []).map((b) =>
      entry.localIds.has(b) ? remap[b] : b,
    );
    return { ...entry.activity, id: newIdByEntry[i], backups };
  });
}

/**
 * Run async tasks with bounded concurrency, preserving input order in the
 * results. Used to respect tight LLM rate limits (TPM): firing all per-type
 * calls at once can exceed a low tokens-per-minute cap (HTTP 413).
 * @template T
 * @param {(() => Promise<T>)[]} tasks
 * @param {number} limit  max in-flight tasks (>=1)
 * @returns {Promise<PromiseSettledResult<T>[]>}
 */
async function settleWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Sample the Action Plan as a few BUCKETED calls, then merge (D52/D54). Types
 * are packed into calls capped at `maxPerBucket` activities (default 21, so no
 * call truncates), each requesting an EXACT per-type count (so the mix is
 * enforced by us, not the model). Validated leniently; batches merged with id
 * renumber + backup remap + dedupe. Robust to a bucket failing: it is skipped
 * (logged) as long as the merged total stays >= minKept.
 *
 * `concurrency` bounds simultaneous calls (default = bucket count). The Groq
 * adapter additionally rotates keys + backs off on rate limits.
 *
 * @param {{ invokeLLM: InvokeLLM, config?: SamplerConfig, minKept?: number,
 *   maxPerBucket?: number, concurrency?: number }} opts
 * @returns {Promise<{ activities: import('./schemas.js').Activity[],
 *   errors: { types: string[], message: string }[], counts: Record<string, number> }>}
 */
export async function sampleActionPlanByType({
  invokeLLM,
  config = DEFAULT_SAMPLER_CONFIG,
  minKept = 1,
  maxPerBucket = 21,
  concurrency,
}) {
  const counts = computeTypeCounts(config.activityCount, config.distribution);
  const buckets = bucketTypeCounts(counts, maxPerBucket);
  const limit = concurrency ?? buckets.length;

  const tasks = buckets.map((bucket) => async () => {
    const raw = await invokeLLM(buildBucketActionPlanPrompt(config, bucket));
    const { activities } = parseActionPlanLenient(raw, 1);
    // Defensive: keep only the types this bucket asked for.
    const wanted = new Set(bucket.map((c) => c.type));
    return activities.filter((a) => wanted.has(a.activityType));
  });

  const settled = await settleWithConcurrency(tasks, limit);

  const batches = [];
  const errors = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      batches.push(result.value);
    } else {
      errors.push({
        types: buckets[i].map((c) => c.type),
        message: String(result.reason?.message ?? result.reason),
      });
    }
  });

  const activities = mergeActionPlanBatches(batches);
  if (activities.length < minKept) {
    throw new Error(
      `Only ${activities.length} valid activities (needed ${minKept})`,
    );
  }
  return { activities, errors, counts };
}

/**
 * Sample the 5 Constraints (resource pools + member context).
 * @param {{ invokeLLM: InvokeLLM, config?: SamplerConfig }} opts
 * @returns {Promise<import('./schemas.js').Constraints>}
 */
export async function sampleConstraints({
  invokeLLM,
  config = DEFAULT_SAMPLER_CONFIG,
}) {
  const [poolsRaw, memberRaw] = await Promise.all([
    invokeLLM(buildResourcePoolsPrompt(config)),
    invokeLLM(buildMemberContextPrompt(config)),
  ]);
  const pools = extractJson(poolsRaw);
  const member = extractJson(memberRaw);
  return Constraints.parse({ ...pools, ...member });
}

/**
 * Full sample: Action Plan + Constraints. Provider-agnostic (BYOK) — supply any
 * `invokeLLM` adapter. Throws if any artifact fails Zod validation.
 * @param {{ invokeLLM: InvokeLLM, config?: SamplerConfig }} opts
 * @returns {Promise<{ actionPlan: Activity[], constraints: Constraints }>}
 */
export async function sample({ invokeLLM, config = DEFAULT_SAMPLER_CONFIG }) {
  if (typeof invokeLLM !== 'function') {
    throw new TypeError(
      'sample() requires an invokeLLM(prompt) => Promise<string> function',
    );
  }
  const actionPlan = await sampleActionPlan({ invokeLLM, config });
  const constraints = await sampleConstraints({ invokeLLM, config });
  return { actionPlan, constraints };
}
