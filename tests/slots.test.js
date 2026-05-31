/**
 * Tests for slot/frequency expansion (src/scheduler/slots.js).
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import {
  targetPlacements,
  candidateMinutesFrom,
  DURATION_MIN,
} from '../src/scheduler/slots.js';
import { DAY_START_MIN, DAY_END_MIN } from '../src/scheduler/config.js';

const act = (count, period, id = 'act-1') => ({
  id,
  priority: 1,
  activityType: 'fitness',
  frequency: { count, period },
});

/* ---- Happy: typical frequencies ----------------------------------------- */

test('happy: daily frequency yields count placements per day', () => {
  const p = targetPlacements(act(2, 'day'), '2026-06-01', '2026-06-03');
  expect(p.length).toBe(6); // 3 days * 2
  expect(p.every((x) => typeof x.anchorMin === 'number')).toBe(true);
});

test('happy: weekly frequency yields count per 7-day block', () => {
  const p = targetPlacements(act(3, 'week'), '2026-06-01', '2026-06-14');
  expect(p.length).toBe(6); // 3 per week * 2 weeks
});

test('happy: monthly frequency yields count per calendar month', () => {
  const p = targetPlacements(act(2, 'month'), '2026-06-01', '2026-07-31');
  expect(p.length).toBe(4); // 2 per month * 2 months
});

/* ---- Hard: spreading + anchors ------------------------------------------ */

test('hard: multiple daily instances get distinct spread anchors', () => {
  const p = targetPlacements(act(3, 'day'), '2026-06-01', '2026-06-01');
  const anchors = p.map((x) => x.anchorMin);
  expect(new Set(anchors).size).toBe(3); // morning / noon / evening, not stacked
  expect(Math.min(...anchors)).toBeGreaterThanOrEqual(DAY_START_MIN);
  expect(Math.max(...anchors)).toBeLessThanOrEqual(DAY_END_MIN);
});

test('hard: candidateMinutesFrom searches outward from the anchor', () => {
  const grid = candidateMinutesFrom(12 * 60);
  expect(grid[0]).toBe(12 * 60); // nearest first
  expect(grid.length).toBeGreaterThan(1);
  // all within the active day window
  expect(grid.every((m) => m >= DAY_START_MIN && m <= DAY_END_MIN)).toBe(true);
});

test('hard: yearly frequency scales proportionally to the range', () => {
  const p = targetPlacements(act(4, 'year'), '2026-06-01', '2026-08-31');
  expect(p.length).toBe(1); // round(4*92/365)
});

/* ---- Edge: clamping / empty / out-of-range ------------------------------ */

test('edge: count larger than available days clamps to one-per-day', () => {
  const p = targetPlacements(act(10, 'week'), '2026-06-01', '2026-06-03');
  expect(p.length).toBe(3);
});

test('edge: inverted range yields no placements', () => {
  expect(targetPlacements(act(1, 'day'), '2026-06-05', '2026-06-01')).toEqual(
    [],
  );
});

test('edge: candidateMinutesFrom clamps an out-of-range anchor into the day', () => {
  const grid = candidateMinutesFrom(3 * 60); // 03:00, before day start
  expect(grid[0]).toBe(DAY_START_MIN);
  expect(DURATION_MIN.consultation).toBe(45);
});
