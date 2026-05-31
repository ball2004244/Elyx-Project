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

import { ActionPlan, Constraints } from './schemas.js';

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

/** Prompt 1 — Action Plan (>= activityCount activities, all 14 fields). */
export const buildActionPlanPrompt = (cfg) => {
  const dist = Object.entries(cfg.distribution)
    .map(([t, f]) => `~${Math.round(f * 100)}% ${t}`)
    .join(', ');
  return `${sharedContext(cfg)}

Generate an Action Plan: a JSON array of >= ${cfg.activityCount} activity objects,
ordered by priority (priority 1 = most important to the member's health).

Each object MUST have exactly these fields:
- id: string, unique, format "act-001", "act-002", ...
- priority: integer >= 1. Lower = more important. Order the array by ascending priority.
- priorityRationale: string. One evidence-backed sentence explaining the priority
  (e.g. "Elevated ApoB and family history of CVD make lipid management top priority").
- activityType: one of fitness | food | medication | therapy | consultation.
- frequency: object { count: integer >= 1, period: "day"|"week"|"month"|"year" }.
- details: string. Concrete instructions, e.g. "Zone-2 cardio, keep HR 120-140".
- facilitator: object {
    type: "self" | "specialist" | "alliedHealth",
    role: string (e.g. "trainer","physiotherapist","dietitian","physician"),
    resourceId: optional string referencing a specialist/alliedHealth id
  }. Use "self" for things the member does alone (most food/medication).
- location: string, e.g. "home", "Elyx gym", "Elyx clinic", "outdoor".
- remoteCapable: boolean. true only if it can be facilitated over video.
- prep: string. What must happen beforehand, else "".
- backups: array of strings. ids or short labels of substitute activities.
- skipAdjustment: string. What to do if skipped (e.g. "shift to next free day").
- metrics: array of strings. Signals to collect (e.g. ["avg_hr","duration_min"]).
- requiredEquipment: array of equipment ids this activity needs, else [].
- track: "scheduled" | "guideline". Use "guideline" for standing dietary/lifestyle
  PRINCIPLES that have no clock time (e.g. "keep added sugar < 25 g/day", "use
  olive oil as the main fat", "finish the last meal 3h before bed"). Everything
  with a real time/cadence is "scheduled". Default "scheduled".

Realism rules (model the member's LIVED experience, not a granular spec):
- CONSOLIDATE supplements. Do NOT emit one activity per pill. Group them into at
  most a "Morning supplement stack" and an "Evening supplement stack" (list the
  compounds in details). Keep ONLY dose-sensitive prescriptions separate
  (e.g. statin, metformin, blood-pressure med, aspirin).
- A realistic day should have ~8-12 scheduled touchpoints, not 30+. If a member
  could not plausibly track it as a discrete task, make it a guideline.
- Daily-cadence items are routines (no booked facilitator time) even if a coach
  reviews them asynchronously; reserve specialists/allied-health for weekly+
  appointments.

Distribution guidance for the >= ${cfg.activityCount} activities: ${dist}.
- Vary frequencies realistically (daily meds, 3x/week training, monthly consults, etc.).
- Equipment ids and facilitator resourceIds referenced here MUST also appear in the
  constraint data. Id namespace: equipment "eq-01".., specialist "sp-01".., alliedHealth "ah-01"..
- Return ONLY the JSON array.`;
};

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
    return JSON.parse(s.slice(start, end + 1));
  }
}

/**
 * Sample the Action Plan only.
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
