/**
 * Tests for src/lib/sampler.js — JSON extraction, prompt builders, BYOK
 * injection via a mock invokeLLM, and Zod post-validation.
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import {
  buildActionPlanPrompt,
  DEFAULT_SAMPLER_CONFIG,
  extractJson,
  sample,
  sampleActionPlan,
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
