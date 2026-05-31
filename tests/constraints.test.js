/**
 * Tests for the constraints availability layer (src/lib/constraintsCsv.js +
 * generated data): CSV round-trip, referential integrity, validity windows,
 * reasoned downtime, and graceful broken-ref handling.
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Constraints, Activity } from '../src/lib/schemas.js';
import { parseCsv } from '../src/lib/csv.js';
import { rowToActivity } from '../src/lib/actionPlanCsv.js';
import {
  toConstraintCsvs,
  fromConstraintCsvs,
  CONSTRAINT_FILES,
} from '../src/lib/constraintsCsv.js';
import { generateConstraints } from '../scripts/availabilityData.js';
import { validateReferences } from '../src/lib/validate.js';

const DATA = join(import.meta.dir, '..', 'src', 'data');

function loadConstraintsFromDisk() {
  return fromConstraintCsvs({
    resources: readFileSync(join(DATA, CONSTRAINT_FILES.resources), 'utf8'),
    resourceWindows: readFileSync(
      join(DATA, CONSTRAINT_FILES.resourceWindows),
      'utf8',
    ),
    clientSchedule: readFileSync(
      join(DATA, CONSTRAINT_FILES.clientSchedule),
      'utf8',
    ),
    travel: readFileSync(join(DATA, CONSTRAINT_FILES.travel), 'utf8'),
  });
}

function loadActionPlanFromDisk() {
  return parseCsv(readFileSync(join(DATA, 'action_plan.csv'), 'utf8')).map(
    rowToActivity,
  );
}

/* ---- Happy: generation + presence --------------------------------------- */

test('happy: generateConstraints produces the full resource bank', () => {
  const c = Constraints.parse(generateConstraints());
  expect(c.equipment.length).toBe(12);
  expect(c.specialists.length).toBe(5);
  expect(c.alliedHealth.length).toBe(9);
});

test('happy: all four constraint CSV files exist on disk', () => {
  for (const f of Object.values(CONSTRAINT_FILES)) {
    expect(existsSync(join(DATA, f))).toBe(true);
  }
});

test('happy: two providers exist for trainer and physiotherapist roles', () => {
  const c = loadConstraintsFromDisk();
  expect(
    c.alliedHealth.filter((p) => p.role === 'personal trainer').length,
  ).toBeGreaterThanOrEqual(2);
  expect(
    c.alliedHealth.filter((p) => p.role === 'physiotherapist').length,
  ).toBeGreaterThanOrEqual(2);
});

/* ---- Hard: round-trip + referential integrity --------------------------- */

test('hard: round-trip generate -> csv -> parse preserves structure', () => {
  const original = Constraints.parse(generateConstraints());
  const round = fromConstraintCsvs(toConstraintCsvs(original));
  expect(round.equipment.length).toBe(original.equipment.length);
  expect(round.clientSchedule.length).toBe(original.clientSchedule.length);
  expect(round.travel.length).toBe(original.travel.length);
  const eq01 = round.equipment.find((e) => e.id === 'eq-01');
  expect(eq01.downtime[0].reason).toContain('maintenance');
});

test('hard: every action-plan reference is satisfiable by the bank', () => {
  const { ok, issues } = validateReferences(
    loadActionPlanFromDisk(),
    loadConstraintsFromDisk(),
  );
  if (!ok) console.error(issues);
  expect(ok).toBe(true);
});

test('hard: action plan has supplement stacks and stays above 100 activities', () => {
  const plan = loadActionPlanFromDisk();
  expect(plan.length).toBeGreaterThanOrEqual(100);
  // Consolidated AM/PM supplement stacks exist (decision D32).
  expect(plan.some((a) => a.id === 'act-201')).toBe(true);
  expect(plan.some((a) => a.id === 'act-202')).toBe(true);
});

/* ---- Edge: incidents, downtime, broken refs ----------------------------- */

test('edge: client schedule contains both commitments and incidents', () => {
  const kinds = new Set(
    loadConstraintsFromDisk().clientSchedule.map((e) => e.kind),
  );
  expect(kinds.has('commitment')).toBe(true);
  expect(kinds.has('incident')).toBe(true);
});

test('edge: at least one resource carries reasoned downtime', () => {
  const c = loadConstraintsFromDisk();
  const withDowntime = [
    ...c.equipment,
    ...c.specialists,
    ...c.alliedHealth,
  ].filter((r) => r.downtime.length > 0);
  expect(withDowntime.length).toBeGreaterThan(0);
});

test('edge: validateReferences catches dangling + unsatisfiable facilitators', () => {
  const broken = [
    Activity.parse({
      id: 'act-x',
      priority: 1,
      activityType: 'fitness',
      frequency: { count: 1, period: 'week' },
      facilitator: { type: 'alliedHealth', role: 'astronaut' },
    }),
    Activity.parse({
      id: 'act-y',
      priority: 1,
      activityType: 'consultation',
      frequency: { count: 1, period: 'month' },
      facilitator: { type: 'specialist', resourceId: 'sp-999' },
    }),
  ];
  const { ok, issues } = validateReferences(broken, loadConstraintsFromDisk());
  expect(ok).toBe(false);
  expect(
    issues.some((i) => i.kind === 'facilitatorRole' && i.ref === 'astronaut'),
  ).toBe(true);
  expect(
    issues.some((i) => i.kind === 'facilitatorResource' && i.ref === 'sp-999'),
  ).toBe(true);
});
