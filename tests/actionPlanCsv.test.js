/**
 * Tests for the action-plan CSV layer (src/lib/actionPlanCsv.js).
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Activity } from '../src/lib/schemas.js';
import { toCsv, parseCsv } from '../src/lib/csv.js';
import {
  activityToRow,
  rowToActivity,
  loadActivities,
  ACTION_PLAN_COLUMNS,
} from '../src/lib/actionPlanCsv.js';

const DATA = join(import.meta.dir, '..', 'src', 'data');

const SAMPLE = Activity.parse({
  id: 'act-999',
  priority: 3,
  priorityRationale: 'Test rationale, with a comma and "quotes".',
  activityType: 'fitness',
  frequency: { count: 3, period: 'week' },
  details: 'Zone-2, keep HR 120-140',
  facilitator: { type: 'alliedHealth', role: 'trainer', resourceId: 'ah-01' },
  location: 'Elyx gym',
  remoteCapable: true,
  prep: 'warm up',
  backups: ['act-001', 'act-002'],
  skipAdjustment: 'shift to next day',
  metrics: ['avg_hr', 'duration_min'],
});

/* ---- Happy: typical mapping --------------------------------------------- */

test('happy: activity -> row -> activity is lossless', () => {
  const round = rowToActivity(activityToRow(SAMPLE));
  expect(round).toEqual(SAMPLE);
});

test('happy: activityToRow flattens nested objects and arrays', () => {
  const row = activityToRow(SAMPLE);
  expect(row.frequencyCount).toBe('3');
  expect(row.facilitatorType).toBe('alliedHealth');
  expect(row.backups).toBe('act-001|act-002');
});

test('happy: loadActivities returns all activities and no errors for clean rows', () => {
  const rows = [activityToRow(SAMPLE)];
  const { activities, errors } = loadActivities(rows);
  expect(activities).toHaveLength(1);
  expect(errors).toHaveLength(0);
});

/* ---- Hard: full CSV + real generated file ------------------------------- */

test('hard: full CSV serialize/parse preserves arrays and quoted fields', () => {
  const csv = toCsv([activityToRow(SAMPLE)], ACTION_PLAN_COLUMNS);
  const [parsed] = parseCsv(csv);
  const round = rowToActivity(parsed);
  expect(round.backups).toEqual(['act-001', 'act-002']);
  expect(round.priorityRationale).toContain('"quotes"');
  expect(round).toEqual(SAMPLE);
});

test('hard: generated action_plan.csv loads, validates, has >=100 activities', () => {
  const file = join(DATA, 'action_plan.csv');
  expect(existsSync(file)).toBe(true);
  const activities = parseCsv(readFileSync(file, 'utf8')).map(rowToActivity);
  expect(activities.length).toBeGreaterThanOrEqual(100);
  const ids = new Set(activities.map((a) => a.id));
  expect(ids.size).toBe(activities.length);
});

test('hard: real file is priority-sorted and has all five activity types', () => {
  const activities = parseCsv(
    readFileSync(join(DATA, 'action_plan.csv'), 'utf8'),
  ).map(rowToActivity);
  for (let i = 1; i < activities.length; i++) {
    expect(activities[i].priority).toBeGreaterThanOrEqual(
      activities[i - 1].priority,
    );
  }
  const types = new Set(activities.map((a) => a.activityType));
  expect([...types].sort()).toEqual([
    'consultation',
    'fitness',
    'food',
    'medication',
    'therapy',
  ]);
});

/* ---- Edge: empty/optional/malformed ------------------------------------- */

test('edge: empty optional columns round-trip to defaults', () => {
  const minimal = activityToRow(
    Activity.parse({
      id: 'act-min',
      priority: 1,
      activityType: 'food',
      frequency: { count: 1, period: 'day' },
      facilitator: { type: 'self' },
    }),
  );
  const round = rowToActivity(minimal);
  expect(round.backups).toEqual([]);
  expect(round.metrics).toEqual([]);
  expect(round.facilitator.resourceId).toBeUndefined();
});

test('edge: a single empty-string cell parses (no array items)', () => {
  const row = activityToRow(SAMPLE);
  row.metrics = '';
  expect(rowToActivity(row).metrics).toEqual([]);
});

test('edge: loadActivities collects errors instead of throwing on bad rows', () => {
  const good = activityToRow(SAMPLE);
  const bad = { ...good, id: 'act-bad', priority: 'NaN-priority' };
  const { activities, errors } = loadActivities([good, bad]);
  expect(activities).toHaveLength(1);
  expect(errors).toHaveLength(1);
  expect(errors[0].id).toBe('act-bad');
});
