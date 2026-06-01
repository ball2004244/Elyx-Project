/**
 * Tests for src/lib/sampler.js — JSON extraction, prompt builders, BYOK
 * injection via a mock invokeLLM, and Zod post-validation.
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import {
  buildActionPlanPrompt,
  buildTypeActionPlanPrompt,
  DEFAULT_SAMPLER_CONFIG,
  extractJson,
  sample,
  sampleActionPlan,
  parseActionPlanLenient,
  normalizeActivityRow,
  computeTypeCounts,
  bucketTypeCounts,
  mergeActionPlanBatches,
  sampleActionPlanByType,
} from '../src/lib/sampler.js';
const ONE_ACTIVITY = [
  {
    id: 'act-001',
    priority: 1,
    priorityRationale: 'Daily statin is the highest-impact intervention.',
    activityType: 'medication',
    frequency: { count: 1, period: 'day' },
    facilitator: { type: 'self' },
  },
];

/* ---- Happy: typical extraction + prompt --------------------------------- */

test('happy: extractJson parses raw JSON', () => {
  expect(extractJson('[{"a":1}]')).toEqual([{ a: 1 }]);
});

test('happy: buildActionPlanPrompt reflects config count and horizon', () => {
  const p = buildActionPlanPrompt(DEFAULT_SAMPLER_CONFIG);
  expect(p).toContain('>= 100 activity objects');
  expect(p).toContain('2026-06-01');
  expect(p).toContain('2026-08-31');
  // References the fixed bank (D49) and drops the D36-removed fields.
  expect(p).toContain('eq-01..12');
  expect(p).not.toContain('requiredEquipment');
  expect(p).not.toContain('track:');
});

test('happy: sampleActionPlan validates a mock LLM response through Zod', async () => {
  const invokeLLM = async () => JSON.stringify(ONE_ACTIVITY);
  const plan = await sampleActionPlan({ invokeLLM });
  expect(plan).toHaveLength(1);
  expect(plan[0].backups).toEqual([]); // Zod defaults applied
});

/* ---- Hard: messy-but-recoverable input + full wiring -------------------- */

test('hard: extractJson strips ```json fences', () => {
  expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  // jsonrepair fallback (D50): trailing commas are salvaged.
  expect(extractJson('[{"a":1,},]')).toEqual([{ a: 1 }]);
});

test('hard: extractJson recovers JSON embedded in prose', () => {
  expect(
    extractJson('Sure! Here you go:\n[1, 2, 3]\nHope that helps.'),
  ).toEqual([1, 2, 3]);
});

test('hard: sample() wires both artifacts from a mock provider', async () => {
  const pools = {
    equipment: [
      {
        id: 'eq-01',
        name: 'Treadmill',
        location: 'Elyx gym',
        availability: [],
      },
    ],
    specialists: [],
    alliedHealth: [],
  };
  const member = { clientSchedule: [], travel: [] };
  const invokeLLM = async (prompt) => {
    if (prompt.includes('Generate an Action Plan'))
      return JSON.stringify(ONE_ACTIVITY);
    if (prompt.includes('Generate the resource pools'))
      return JSON.stringify(pools);
    return JSON.stringify(member);
  };
  const { actionPlan, constraints } = await sample({ invokeLLM });
  expect(actionPlan).toHaveLength(1);
  expect(constraints.equipment[0].id).toBe('eq-01');
});

/* ---- Edge: malformed input + bad usage ---------------------------------- */

test('edge: extractJson throws when no JSON is present', () => {
  expect(() => extractJson('no json here')).toThrow();
});

test('edge: sample() throws if invokeLLM is not a function', async () => {
  await expect(sample({ invokeLLM: null })).rejects.toThrow();
});

test('edge: sampleActionPlan rejects schema-invalid LLM output', async () => {
  const invokeLLM = async () => JSON.stringify([{ id: 'x' }]); // missing fields
  await expect(sampleActionPlan({ invokeLLM })).rejects.toThrow();
});

/* ---- Lenient parsing + normalization (live-LLM resilience, D50) --------- */

const validRow = (over) => ({
  id: 'act-010',
  priority: 5,
  activityType: 'fitness',
  frequency: { count: 3, period: 'week' },
  facilitator: { type: 'self' },
  ...over,
});

/* happy */

test('happy: parseActionPlanLenient keeps all valid rows', () => {
  const raw = JSON.stringify([validRow(), validRow({ id: 'act-011' })]);
  const { activities, errors } = parseActionPlanLenient(raw);
  expect(activities).toHaveLength(2);
  expect(errors).toHaveLength(0);
});

test('happy: normalizeActivityRow maps period aliases to the enum', () => {
  expect(
    normalizeActivityRow({ frequency: { count: 1, period: 'daily' } }),
  ).toEqual({ frequency: { count: 1, period: 'day' } });
  expect(
    normalizeActivityRow({ frequency: { count: 1, period: 'WEEKLY' } }),
  ).toEqual({ frequency: { count: 1, period: 'week' } });
  expect(
    normalizeActivityRow({ frequency: { count: 1, period: 'quarterly' } }),
  ).toEqual({ frequency: { count: 1, period: 'month' } });
});

test('happy: normalizeActivityRow coerces stringified numbers', () => {
  const out = normalizeActivityRow({
    priority: '4',
    frequency: { count: '2', period: 'day' },
  });
  expect(out.priority).toBe(4);
  expect(out.frequency.count).toBe(2);
});

/* hard */

test('hard: parseActionPlanLenient recovers a "daily" period row via normalize', () => {
  const raw = JSON.stringify([
    validRow({ frequency: { count: 1, period: 'daily' } }),
  ]);
  const { activities } = parseActionPlanLenient(raw);
  expect(activities).toHaveLength(1);
  expect(activities[0].frequency.period).toBe('day');
});

test('hard: parseActionPlanLenient drops a bad row but keeps the good ones', () => {
  const raw = JSON.stringify([
    validRow(),
    { id: 'bad' }, // missing required fields, unrecoverable
    validRow({ id: 'act-012' }),
  ]);
  const { activities, errors } = parseActionPlanLenient(raw);
  expect(activities).toHaveLength(2);
  expect(errors).toHaveLength(1);
  expect(errors[0].index).toBe(1);
});

test('hard: parseActionPlanLenient throws when fewer than minKept survive', () => {
  const raw = JSON.stringify([validRow(), { id: 'bad' }]);
  expect(() => parseActionPlanLenient(raw, 2)).toThrow(/needed 2/);
});

/* edge */

test('edge: parseActionPlanLenient throws on a non-array response', () => {
  expect(() => parseActionPlanLenient(JSON.stringify({ a: 1 }))).toThrow();
});

test('edge: normalizeActivityRow passes through non-objects untouched', () => {
  expect(normalizeActivityRow(null)).toBe(null);
  expect(normalizeActivityRow('x')).toBe('x');
});

test('edge: normalizeActivityRow leaves an unknown period as-is (caught by Zod)', () => {
  const out = normalizeActivityRow({
    frequency: { count: 1, period: 'sprint' },
  });
  expect(out.frequency.period).toBe('sprint');
});

/* ---- Per-type parallel sampling (D52) ----------------------------------- */

const typed = (type, id, over = {}) => ({
  id,
  priority: 5,
  activityType: type,
  frequency: { count: 1, period: 'day' },
  facilitator: { type: 'self' },
  details: `${type} ${id}`,
  ...over,
});

/* happy */

test('happy: computeTypeCounts hits the exact total', () => {
  const counts = computeTypeCounts(100, DEFAULT_SAMPLER_CONFIG.distribution);
  const sum = Object.values(counts).reduce((n, c) => n + c, 0);
  expect(sum).toBe(100);
  expect(counts.fitness).toBeGreaterThan(counts.consultation);
  // Bucketing packs types into capped calls, splitting big types; every
  // activity is preserved (sum of chunk counts per type == original count).
  const buckets = bucketTypeCounts(counts, 21);
  const regrouped = {};
  for (const b of buckets)
    for (const ch of b)
      regrouped[ch.type] = (regrouped[ch.type] ?? 0) + ch.count;
  expect(regrouped).toEqual(counts); // no activity lost
  // No bucket exceeds the cap.
  for (const b of buckets) {
    const load = b.reduce((n, ch) => n + ch.count, 0);
    expect(load).toBeLessThanOrEqual(21);
  }
});

test('happy: buildTypeActionPlanPrompt asks for an exact count of one type', () => {
  const p = buildTypeActionPlanPrompt(DEFAULT_SAMPLER_CONFIG, 'therapy', 12);
  expect(p).toContain('EXACTLY 12 DISTINCT "therapy"');
  expect(p).toContain('eq-01..12'); // still bank-constrained
});

test('happy: mergeActionPlanBatches renumbers ids contiguously', () => {
  const merged = mergeActionPlanBatches([
    [typed('fitness', 'act-001'), typed('fitness', 'act-002')],
    [typed('food', 'act-001')],
  ]);
  expect(merged.map((a) => a.id)).toEqual(['act-001', 'act-002', 'act-003']);
});

/* hard */

test('hard: mergeActionPlanBatches remaps backups within a batch', () => {
  // Two fitness rows where the first backs up to the second (local id act-002).
  const merged = mergeActionPlanBatches([
    [
      typed('food', 'act-001'), // sorts first by id within same priority
    ],
    [
      typed('fitness', 'act-001', { backups: ['act-002'], priority: 1 }),
      typed('fitness', 'act-002', { priority: 1 }),
    ],
  ]);
  // The fitness rows (priority 1) sort ahead of the food row (priority 5).
  const withBackup = merged.find((a) => a.backups.length > 0);
  // Its backup must point to the NEW id of its sibling, not the stale local one.
  const target = merged.find((a) => a.id === withBackup.backups[0]);
  expect(target).toBeTruthy();
  expect(target.activityType).toBe('fitness');
});

test('hard: mergeActionPlanBatches dedupes by type + first clause', () => {
  const merged = mergeActionPlanBatches([
    [typed('fitness', 'act-001', { details: 'Zone-2 run: 40 min' })],
    [typed('fitness', 'act-001', { details: 'Zone-2 run: easy pace' })], // dup head
    [typed('fitness', 'act-002', { details: 'Barbell squat: 5x5' })],
  ]);
  expect(merged).toHaveLength(2); // the duplicate "Zone-2 run" is dropped
});

test('hard: sampleActionPlanByType enforces the mix and merges', async () => {
  const invokeLLM = async (prompt) => {
    // Parse the bucket prompt's "EXACTLY N distinct "type" activities" lines.
    const rows = [];
    let n = 1;
    for (const m of prompt.matchAll(/EXACTLY (\d+) distinct "(\w+)"/g)) {
      const [, count, type] = m;
      for (let i = 0; i < Number(count); i++) {
        rows.push(
          typed(type, `act-${String(n).padStart(3, '0')}`, {
            details: `${type} variant ${n}`,
          }),
        );
        n += 1;
      }
    }
    return JSON.stringify(rows);
  };
  const cfg = { ...DEFAULT_SAMPLER_CONFIG, activityCount: 20 };
  const { activities, counts, errors } = await sampleActionPlanByType({
    invokeLLM,
    config: cfg,
  });
  expect(errors).toHaveLength(0);
  expect(activities).toHaveLength(20);
  // Distribution is enforced by us: counts sum to the requested total.
  expect(Object.values(counts).reduce((n, c) => n + c, 0)).toBe(20);
});

/* edge */

test('edge: computeTypeCounts ignores zero-weight types', () => {
  const counts = computeTypeCounts(10, { fitness: 1, food: 0 });
  expect(counts.food).toBeUndefined();
  expect(counts.fitness).toBe(10);
  // A big type is split into separate capped buckets (28 fitness → 14+14).
  const split = bucketTypeCounts({ fitness: 28 }, 21);
  expect(split).toHaveLength(2);
  expect(split.reduce((n, b) => n + b[0].count, 0)).toBe(28);
  expect(split.every((b) => b[0].count <= 21)).toBe(true);
  // Split chunks carry part/of so the prompt can ask for different slices.
  expect(split.every((b) => b[0].of === 2)).toBe(true);
});

test('edge: mergeActionPlanBatches handles empty + all-empty batches', () => {
  expect(mergeActionPlanBatches([])).toEqual([]);
  expect(mergeActionPlanBatches([[], []])).toEqual([]);
});

test('edge: sampleActionPlanByType tolerates a failed bucket call', async () => {
  const invokeLLM = async (prompt) => {
    // Fail the bucket that contains medication; fulfill the rest.
    if (prompt.includes('"medication"')) throw new Error('rate limited');
    const rows = [];
    let n = 1;
    for (const m of prompt.matchAll(/EXACTLY (\d+) distinct "(\w+)"/g)) {
      const [, count, type] = m;
      for (let i = 0; i < Number(count); i++) {
        rows.push(
          typed(type, `act-${String(n).padStart(3, '0')}`, {
            details: `${type} v${n}`,
          }),
        );
        n += 1;
      }
    }
    return JSON.stringify(rows);
  };
  const cfg = { ...DEFAULT_SAMPLER_CONFIG, activityCount: 20 };
  const { activities, errors } = await sampleActionPlanByType({
    invokeLLM,
    config: cfg,
    minKept: 1,
    maxPerBucket: 4, // small cap → one type per bucket, isolating the failure
  });
  expect(errors.some((e) => e.types.includes('medication'))).toBe(true);
  expect(activities.length).toBeGreaterThan(0); // other buckets still merged
});
