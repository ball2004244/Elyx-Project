/**
 * Tests for validateReferences (src/lib/validate.js).
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import { Activity, Constraints } from '../src/lib/schemas.js';
import { validateReferences } from '../src/lib/validate.js';

const CONSTRAINTS = Constraints.parse({
  equipment: [{ id: 'eq-01', name: 'Treadmill' }],
  specialists: [{ id: 'sp-01', name: 'Dr. A', role: 'cardiologist' }],
  alliedHealth: [{ id: 'ah-01', name: 'Coach B', role: 'personal trainer' }],
});

const act = (over) =>
  Activity.parse({
    id: 'act-1',
    priority: 1,
    activityType: 'fitness',
    frequency: { count: 1, period: 'week' },
    facilitator: { type: 'self' },
    ...over,
  });

/* ---- Happy: valid references pass --------------------------------------- */

test('happy: clean plan passes referential integrity', () => {
  const plan = [
    act({
      facilitator: { type: 'alliedHealth', role: 'personal trainer' },
    }),
  ];
  expect(validateReferences(plan, CONSTRAINTS).ok).toBe(true);
});

test('happy: self-facilitated activity needs no provider', () => {
  expect(validateReferences([act({})], CONSTRAINTS).ok).toBe(true);
});

test('happy: a valid pinned facilitator passes', () => {
  const plan = [
    act({ facilitator: { type: 'specialist', resourceId: 'sp-01' } }),
  ];
  expect(validateReferences(plan, CONSTRAINTS).ok).toBe(true);
});

/* ---- Hard: multiple/mixed reference kinds ------------------------------- */

test('hard: role-based facilitator resolves without a pinned id', () => {
  const plan = [
    act({ facilitator: { type: 'alliedHealth', role: 'personal trainer' } }),
  ];
  expect(validateReferences(plan, CONSTRAINTS).ok).toBe(true);
});

test('hard: multiple issues across activities are all collected', () => {
  const plan = [
    act({ id: 'a', facilitator: { type: 'specialist', resourceId: 'sp-99' } }),
    act({ id: 'b', facilitator: { type: 'alliedHealth', role: 'wizard' } }),
  ];
  const { ok, issues } = validateReferences(plan, CONSTRAINTS);
  expect(ok).toBe(false);
  expect(issues.length).toBe(2);
});

test('hard: a pinned-but-missing facilitator and a bad role both flagged', () => {
  const plan = [
    act({ id: 'a', facilitator: { type: 'specialist', resourceId: 'sp-99' } }),
    act({ id: 'b', facilitator: { type: 'specialist', role: 'wizard' } }),
  ];
  const { ok, issues } = validateReferences(plan, CONSTRAINTS);
  expect(ok).toBe(false);
  expect(issues.map((i) => i.kind).sort()).toEqual([
    'facilitatorResource',
    'facilitatorRole',
  ]);
});

/* ---- Edge: each individual failure mode --------------------------------- */

test('edge: a clean self-facilitated plan reports no issues', () => {
  const { ok, issues } = validateReferences([act({})], CONSTRAINTS);
  expect(ok).toBe(true);
  expect(issues).toHaveLength(0);
});

test('edge: dangling pinned facilitator is reported', () => {
  const { ok, issues } = validateReferences(
    [act({ facilitator: { type: 'specialist', resourceId: 'sp-99' } })],
    CONSTRAINTS,
  );
  expect(ok).toBe(false);
  expect(issues[0].kind).toBe('facilitatorResource');
});

test('edge: unsatisfiable role is reported', () => {
  const { ok, issues } = validateReferences(
    [act({ facilitator: { type: 'alliedHealth', role: 'astronaut' } })],
    CONSTRAINTS,
  );
  expect(ok).toBe(false);
  expect(issues[0].kind).toBe('facilitatorRole');
});
