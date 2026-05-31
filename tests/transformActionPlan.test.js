/**
 * Tests for action-plan transforms (scripts/transformActionPlan.js) and
 * canonicalizeRole (scripts/resourceBank.js).
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import { canonicalizeRole } from '../scripts/resourceBank.js';
import {
  transformActivity,
  CONTINUITY_PINS,
  HARD_ACTIVITIES,
  SUPPLEMENT_IDS,
  SUPPLEMENT_STACKS,
  postProcessPlan,
} from '../scripts/transformActionPlan.js';

const base = {
  id: 'act-200',
  priority: 1,
  activityType: 'fitness',
  frequency: { count: 1, period: 'week' },
  facilitator: {
    type: 'alliedHealth',
    role: 'Personal Trainer',
    resourceId: 'ah-01',
  },
};

/* ---- Happy: typical transforms ------------------------------------------ */

test('happy: canonicalizeRole maps aliases to canonical roles', () => {
  expect(canonicalizeRole('Personal Trainer')).toBe('personal trainer');
  expect(canonicalizeRole('physio')).toBe('physiotherapist');
  expect(canonicalizeRole('Trainer')).toBe('personal trainer');
});

test('happy: transformActivity de-pins role-based facilitators', () => {
  const out = transformActivity(base);
  expect(out.facilitator.role).toBe('personal trainer');
  expect(out.facilitator.resourceId).toBeUndefined();
});

test('happy: postProcessPlan appends the two supplement stacks', () => {
  const out = postProcessPlan([transformActivity(base)]);
  expect(out.some((a) => a.id === 'act-201')).toBe(true);
  expect(out.some((a) => a.id === 'act-202')).toBe(true);
});

/* ---- Hard: continuity pins, consolidation, hard activities -------------- */

test('hard: transformActivity keeps resourceId for continuity pins', () => {
  const pinnedId = Object.keys(CONTINUITY_PINS)[0];
  const out = transformActivity({ ...base, id: pinnedId });
  expect(out.facilitator.resourceId).toBe(CONTINUITY_PINS[pinnedId]);
});

test('hard: postProcessPlan drops the consolidated supplement ids', () => {
  const supId = [...SUPPLEMENT_IDS][0];
  const input = [
    transformActivity({ ...base, id: supId }),
    transformActivity({ ...base, id: 'act-keep' }),
  ];
  const out = postProcessPlan(input);
  expect(out.some((a) => a.id === supId)).toBe(false);
  expect(out.some((a) => a.id === 'act-keep')).toBe(true);
  expect(SUPPLEMENT_STACKS).toHaveLength(2);
});

test('hard: hard activities are well-formed and typed', () => {
  expect(HARD_ACTIVITIES.length).toBeGreaterThanOrEqual(2);
  for (const a of HARD_ACTIVITIES) {
    expect(a.id).toMatch(/^act-\d+$/);
    expect([
      'fitness',
      'food',
      'medication',
      'therapy',
      'consultation',
    ]).toContain(a.activityType);
  }
});

/* ---- Edge: self-variants, empty, unknown roles -------------------------- */

test('edge: canonicalizeRole maps self-variants to "self"', () => {
  expect(canonicalizeRole('self-directed')).toBe('self');
  expect(canonicalizeRole('Member')).toBe('self');
  expect(canonicalizeRole('self-administer')).toBe('self');
});

test('edge: canonicalizeRole handles empty/missing/unknown input', () => {
  expect(canonicalizeRole('')).toBe('');
  expect(canonicalizeRole(undefined)).toBe('');
  expect(canonicalizeRole('Astronaut')).toBe('astronaut');
});

test('edge: transformActivity strips role/resourceId for self activities', () => {
  const out = transformActivity({
    ...base,
    facilitator: { type: 'self', role: 'self-directed' },
  });
  expect(out.facilitator.role).toBeUndefined();
  expect(out.facilitator.resourceId).toBeUndefined();
});
