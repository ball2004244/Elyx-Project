/**
 * Tests for src/lib/schemas.js — Zod 4 schema parsing/validation.
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import {
  Activity,
  ActionPlan,
  Constraints,
  ScheduledInstance,
  TimeWindow,
  ReasonedWindow,
} from '../src/lib/schemas.js';

/* ---- Happy: typical valid parsing --------------------------------------- */

test('happy: TimeWindow accepts a valid forward window', () => {
  const ok = TimeWindow.parse({
    start: '2026-06-01T09:00:00',
    end: '2026-06-01T10:00:00',
  });
  expect(ok.start < ok.end).toBe(true);
});

test('happy: Activity applies defaults for optional fields', () => {
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
  expect(a.priorityRationale).toBe('');
});

test('happy: ActionPlan parses a list of activities', () => {
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

/* ---- Hard: complex-but-valid structures --------------------------------- */

test('hard: Activity with nested facilitator + arrays parses fully', () => {
  const a = Activity.parse({
    id: 'act-027',
    priority: 4,
    priorityRationale: 'rehab block',
    activityType: 'fitness',
    frequency: { count: 3, period: 'week' },
    facilitator: {
      type: 'alliedHealth',
      role: 'physiotherapist',
      resourceId: 'ah-02',
    },
    backups: ['act-026'],
    metrics: ['rom_deg', 'sets'],
  });
  expect(a.facilitator.resourceId).toBe('ah-02');
  expect(a.backups).toEqual(['act-026']);
});

test('hard: Constraints with reasoned downtime + incident kind', () => {
  const c = Constraints.parse({
    equipment: [
      {
        id: 'eq-01',
        name: 'Treadmill',
        availability: [
          { start: '2026-06-01T06:00:00', end: '2026-06-01T21:00:00' },
        ],
        downtime: [
          {
            start: '2026-06-23T00:00:00',
            end: '2026-06-25T00:00:00',
            reason: 'maintenance',
          },
        ],
      },
    ],
    clientSchedule: [
      {
        start: '2026-06-18T08:00:00',
        end: '2026-06-18T18:00:00',
        label: 'sick',
        kind: 'incident',
      },
    ],
  });
  expect(c.equipment[0].downtime[0].reason).toBe('maintenance');
  expect(c.clientSchedule[0].kind).toBe('incident');
});

test('hard: ScheduledInstance for a placed primary instance', () => {
  const s = ScheduledInstance.parse({
    activityId: 'act-002',
    kind: 'primary',
    window: { start: '2026-06-01T07:00:00', end: '2026-06-01T08:00:00' },
    facilitatorId: 'ah-01',
    equipmentIds: ['eq-01', 'eq-10'],
    isRemote: false,
    metrics: ['avg_hr'],
  });
  expect(s.kind).toBe('primary');
  expect(s.equipmentIds).toHaveLength(2);
});

/* ---- Edge: boundary / error cases --------------------------------------- */

test('edge: TimeWindow rejects an inverted window', () => {
  expect(() =>
    TimeWindow.parse({
      start: '2026-06-01T10:00:00',
      end: '2026-06-01T09:00:00',
    }),
  ).toThrow();
});

test('edge: Activity rejects unknown activityType and bad frequency', () => {
  expect(() =>
    Activity.parse({
      id: 'x',
      priority: 1,
      activityType: 'sleeping',
      frequency: { count: 1, period: 'day' },
      facilitator: { type: 'self' },
    }),
  ).toThrow();
  expect(() =>
    Activity.parse({
      id: 'x',
      priority: 1,
      activityType: 'fitness',
      frequency: { count: 1, period: 'fortnight' },
      facilitator: { type: 'self' },
    }),
  ).toThrow();
});

test('edge: empty Constraints and skipped ScheduledInstance defaults', () => {
  const c = Constraints.parse({});
  expect(c.equipment).toEqual([]);
  expect(c.specialists).toEqual([]);
  const s = ScheduledInstance.parse({
    activityId: 'act-001',
    kind: 'skipped',
    window: null,
  });
  expect(s.window).toBeNull();
  expect(s.facilitatorId).toBeNull();
  // ReasonedWindow defaults reason to ''.
  const w = ReasonedWindow.parse({
    start: '2026-06-01T06:00:00',
    end: '2026-06-01T07:00:00',
  });
  expect(w.reason).toBe('');
});
