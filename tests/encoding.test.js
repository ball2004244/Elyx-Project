/**
 * Tests for the calendar's visual-encoding helpers (src/ui/encoding.js).
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import {
  TYPE_STYLE,
  TYPE_ORDER,
  KIND_LABEL,
  clock,
  dayLabel,
  monthLabel,
  dayPart,
} from '../src/ui/encoding.js';

/* ---- Happy: typical formatting ------------------------------------------ */

test('happy: clock formats an ISO datetime to HH:MM', () => {
  expect(clock('2026-06-01T09:30:00')).toBe('09:30');
});

test('happy: dayLabel returns weekday + day-of-month', () => {
  expect(dayLabel('2026-06-01')).toEqual({ weekday: 'Mon', dom: 1 });
});

test('happy: monthLabel returns month + year', () => {
  expect(monthLabel('2026-06-15')).toBe('June 2026');
});

/* ---- Hard: encoding completeness & consistency -------------------------- */

test('hard: every activity type has a complete style entry and TYPE_ORDER matches', () => {
  for (const type of TYPE_ORDER) {
    const s = TYPE_STYLE[type];
    expect(s).toBeDefined();
    expect(typeof s.label).toBe('string');
    expect(s.block.length).toBeGreaterThan(0);
    expect(s.dot.length).toBeGreaterThan(0);
  }
  expect([...TYPE_ORDER].sort()).toEqual([
    'consultation',
    'fitness',
    'food',
    'medication',
    'therapy',
  ]);
});

test('hard: KIND_LABEL covers all three placement kinds', () => {
  expect(KIND_LABEL.primary).toBeDefined();
  expect(KIND_LABEL.backup).toBeDefined();
  expect(KIND_LABEL.skipped).toBeDefined();
});

test('hard: dayPart bands times into morning/afternoon/evening', () => {
  expect(dayPart('2026-06-01T07:00:00')).toBe('morning');
  expect(dayPart('2026-06-01T13:30:00')).toBe('afternoon');
  expect(dayPart('2026-06-01T19:00:00')).toBe('evening');
});

test('hard: dayPart bands times into morning/afternoon/evening', () => {
  expect(dayPart('2026-06-01T07:00:00')).toBe('morning');
  expect(dayPart('2026-06-01T13:30:00')).toBe('afternoon');
  expect(dayPart('2026-06-01T19:00:00')).toBe('evening');
});

/* ---- Edge: boundaries --------------------------------------------------- */

test('edge: clock and dayPart handle boundaries', () => {
  expect(clock('2026-06-01T00:00:00')).toBe('00:00');
  expect(clock('2026-06-01T23:59:00')).toBe('23:59');
  // Band boundaries are inclusive-low: 12:00 → afternoon, 17:00 → evening.
  expect(dayPart('2026-06-01T11:59:00')).toBe('morning');
  expect(dayPart('2026-06-01T12:00:00')).toBe('afternoon');
  expect(dayPart('2026-06-01T17:00:00')).toBe('evening');
});

test('edge: dayLabel marks Sunday as the week boundary', () => {
  expect(dayLabel('2026-06-07')).toEqual({ weekday: 'Sun', dom: 7 });
});

test('edge: monthLabel handles a year boundary (December)', () => {
  expect(monthLabel('2026-12-31')).toBe('December 2026');
});
