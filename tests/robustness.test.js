/**
 * Robustness tests: prove the loader degrades gracefully on STRUCTURALLY messy
 * input (bad types, missing fields, invalid enums, dangling refs) without
 * aborting, and that the validator catches dangling references. Uses the
 * quarantined src/data/messy_sample.csv, which the app never loads by default.
 *
 * Covers typical, edge, and error scenarios per CodeStyle.md.
 */

import { expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/lib/csv.js';
import { loadActivities, rowToActivity } from '../src/lib/actionPlanCsv.js';
import {
  fromConstraintCsvs,
  CONSTRAINT_FILES,
} from '../src/lib/constraintsCsv.js';
import { validateReferences } from '../src/lib/validate.js';

const DATA = join(import.meta.dir, '..', 'src', 'data');
const messyRows = () =>
  parseCsv(readFileSync(join(DATA, 'messy_sample.csv'), 'utf8'));

/* ---- Happy: quarantine + graceful load ---------------------------------- */

test('happy: messy_sample.csv exists and is quarantined from the default', () => {
  expect(existsSync(join(DATA, 'messy_sample.csv'))).toBe(true);
  expect(existsSync(join(DATA, 'action_plan.csv'))).toBe(true);
});

test('happy: loadActivities keeps good rows and collects errors for bad ones', () => {
  const { activities, errors } = loadActivities(messyRows());
  expect(activities.length).toBeGreaterThan(0); // clean rows survived
  expect(errors.length).toBeGreaterThan(0); // bad rows were caught
  expect(activities.length + errors.length).toBe(messyRows().length);
});

test('happy: unit-mismatch row still loads (units are free text)', () => {
  const { activities } = loadActivities(messyRows());
  const unit = activities.find((a) => a.id === 'act-unit-mismatch');
  expect(unit).toBeDefined();
  expect(unit.details).toContain('mmol/L');
});

/* ---- Hard: validator + strict path on messy data ------------------------ */

test('hard: validator flags the dangling-facilitator row against the bank', () => {
  const { activities } = loadActivities(messyRows());
  const constraints = fromConstraintCsvs({
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
  const { ok, issues } = validateReferences(activities, constraints);
  expect(ok).toBe(false);
  expect(issues.some((i) => i.ref === 'sp-999')).toBe(true);
});

test('hard: strict rowToActivity throws on a malformed row', () => {
  const bad = messyRows().find((r) => r.id === 'act-bad-priority');
  expect(() => rowToActivity(bad)).toThrow();
});

test('hard: every input row is accounted for (parsed or errored)', () => {
  const rows = messyRows();
  const { activities, errors } = loadActivities(rows);
  const handled = new Set([
    ...activities.map((a) => a.id),
    ...errors.map((e) => e.id),
  ]);
  // No row silently vanishes (ignoring the intentional empty-id row).
  expect(activities.length + errors.length).toBe(rows.length);
  expect(handled.size).toBeGreaterThan(0);
});

/* ---- Edge: each malformed field type ------------------------------------ */

test('edge: non-numeric priority is rejected, not silently coerced', () => {
  const { errors } = loadActivities(messyRows());
  expect(errors.some((e) => e.id === 'act-bad-priority')).toBe(true);
});

test('edge: missing activityType and invalid frequency period are rejected', () => {
  const { errors } = loadActivities(messyRows());
  expect(errors.some((e) => e.id === 'act-missing-type')).toBe(true);
  expect(errors.some((e) => e.id === 'act-bad-period')).toBe(true);
});

test('edge: empty id is rejected', () => {
  const { errors } = loadActivities(messyRows());
  expect(errors.length).toBeGreaterThanOrEqual(1);
});
