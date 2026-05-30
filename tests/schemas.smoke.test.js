/**
 * Smoke test for src/lib/schemas.js — confirms the Zod 4 API usage parses
 * representative valid objects and rejects malformed ones.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import {
  Activity,
  ActionPlan,
  Constraints,
  ScheduledInstance,
  TimeWindow,
} from '../src/lib/schemas.js';

test('TimeWindow accepts valid window and rejects inverted', () => {
  const ok = TimeWindow.parse({
    start: '2026-06-01T09:00:00',
    end: '2026-06-01T10:00:00',
  });
  expect(ok.start < ok.end).toBe(true);

  expect(() =>
    TimeWindow.parse({ start: '2026-06-01T10:00:00', end: '2026-06-01T09:00:00' }),
  ).toThrow();
});

test('Activity applies defaults for the optional 10-field props', () => {
  const a = Activity.parse({
    id: 'act-001',
    priority: 1,
    activityType: 'fitness',
    frequency: { count: 3, period: 'week' },
    facilitator: { type: 'alliedHealth', role: 'trainer' },
  });
  expect(a.details).toBe('');
  expect(a.remoteCapable).toBe(false);
  expect(a.backups).toEqual([]);
  expect(a.metrics).toEqual([]);
  expect(a.requiredEquipment).toEqual([]);
});

test('Activity rejects unknown activityType', () => {
  expect(() =>
    Activity.parse({
      id: 'x',
      priority: 1,
      activityType: 'sleeping',
      frequency: { count: 1, period: 'day' },
      facilitator: { type: 'self' },
    }),
  ).toThrow();
});

test('ActionPlan parses a list of activities', () => {
  const plan = ActionPlan.parse([
    {
      id: 'act-001',
      priority: 1,
      activityType: 'medication',
      frequency: { count: 1, period: 'day' },
      facilitator: { type: 'self' },
    },
  ]);
  expect(plan).toHaveLength(1);
});

test('Constraints applies empty-array defaults', () => {
  const c = Constraints.parse({});
  expect(c.clientSchedule).toEqual([]);
  expect(c.equipment).toEqual([]);
  expect(c.specialists).toEqual([]);
});

test('ScheduledInstance allows null window when skipped', () => {
  const s = ScheduledInstance.parse({
    activityId: 'act-001',
    kind: 'skipped',
    window: null,
    note: 'no slot; applied skip-adjustment',
  });
  expect(s.window).toBeNull();
  expect(s.facilitatorId).toBeNull();
});
