/**
 * Tests for scheduler time-interval primitives (src/scheduler/intervals.js).
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import {
  toMs,
  toIso,
  dayKey,
  isoAtMinutes,
  addMinutes,
  overlaps,
  contains,
  eachDay,
  weekday,
} from '../src/scheduler/intervals.js';

/* ---- Happy: typical conversions ----------------------------------------- */

test('happy: toMs/toIso round-trip a local ISO datetime', () => {
  const iso = '2026-06-01T09:30:00';
  expect(toIso(toMs(iso))).toBe(iso);
});

test('happy: dayKey extracts the date portion', () => {
  expect(dayKey('2026-06-01T09:30:00')).toBe('2026-06-01');
});

test('happy: isoAtMinutes and addMinutes build/advance datetimes', () => {
  expect(isoAtMinutes('2026-06-01', 9 * 60 + 30)).toBe('2026-06-01T09:30:00');
  expect(addMinutes('2026-06-01T09:30:00', 60)).toBe('2026-06-01T10:30:00');
});

/* ---- Hard: overlap/containment logic ------------------------------------ */

test('hard: overlaps detects a genuine partial overlap', () => {
  expect(
    overlaps(
      '2026-06-01T09:00:00',
      '2026-06-01T10:00:00',
      '2026-06-01T09:30:00',
      '2026-06-01T11:00:00',
    ),
  ).toBe(true);
});

test('hard: contains checks full containment', () => {
  expect(
    contains(
      '2026-06-01T08:00:00',
      '2026-06-01T12:00:00',
      '2026-06-01T09:00:00',
      '2026-06-01T10:00:00',
    ),
  ).toBe(true);
  expect(
    contains(
      '2026-06-01T09:00:00',
      '2026-06-01T10:00:00',
      '2026-06-01T08:00:00',
      '2026-06-01T10:00:00',
    ),
  ).toBe(false);
});

test('hard: eachDay lists an inclusive multi-day range', () => {
  expect(eachDay('2026-06-01', '2026-06-03')).toEqual([
    '2026-06-01',
    '2026-06-02',
    '2026-06-03',
  ]);
});

/* ---- Edge: boundaries --------------------------------------------------- */

test('edge: overlaps is half-open (touching edges do not overlap)', () => {
  expect(
    overlaps(
      '2026-06-01T09:00:00',
      '2026-06-01T10:00:00',
      '2026-06-01T10:00:00',
      '2026-06-01T11:00:00',
    ),
  ).toBe(false);
});

test('edge: eachDay handles a single-day range', () => {
  expect(eachDay('2026-06-01', '2026-06-01')).toEqual(['2026-06-01']);
});

test('edge: weekday returns 0=Sun and 6=Sat at week boundaries', () => {
  expect(weekday('2026-06-01')).toBe(1); // Monday
  expect(weekday('2026-06-07')).toBe(0); // Sunday
});
