/**
 * Tests for event vs routine classification (src/scheduler/classify.js).
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import { isEvent } from '../src/scheduler/classify.js';

const make = (over) => ({
  id: 'a',
  priority: 1,
  activityType: 'fitness',
  frequency: { count: 1, period: 'week' },
  facilitator: { type: 'self' },
  location: 'home',
  ...over,
});

/* ---- Happy: clear events vs routines ------------------------------------ */

test('happy: a facilitated weekly activity is an event', () => {
  expect(
    isEvent(make({ facilitator: { type: 'alliedHealth', role: 'trainer' } })),
  ).toBe(true);
});

test('happy: a self activity at home is a routine', () => {
  expect(isEvent(make({ location: 'home' }))).toBe(false);
});

test('happy: a self weekly activity at a venue is an event', () => {
  expect(isEvent(make({ location: 'Elyx clinic' }))).toBe(true);
});

/* ---- Hard: venue + facilitator + cadence combinations ------------------- */

test('hard: specialist facilitator (weekly) is an event regardless of location', () => {
  expect(
    isEvent(
      make({
        facilitator: { type: 'specialist', resourceId: 'sp-01' },
        location: 'home',
      }),
    ),
  ).toBe(true);
});

test('hard: gym venue makes a self weekly activity an event', () => {
  expect(isEvent(make({ location: 'Elyx gym' }))).toBe(true);
});

test('hard: a DAILY facilitated activity is a routine, not an event', () => {
  // Async-reviewed daily logs (e.g. photo-log a meal) are routines even though
  // a coach is named — you do not book the coach to photograph lunch.
  expect(
    isEvent(
      make({
        frequency: { count: 3, period: 'day' },
        facilitator: { type: 'alliedHealth', role: 'health coach' },
      }),
    ),
  ).toBe(false);
});

/* ---- Edge: casing / empty / daily venue --------------------------------- */

test('edge: venue match is case-insensitive (weekly)', () => {
  expect(isEvent(make({ location: 'ELYX GYM' }))).toBe(true);
});

test('edge: empty location with self facilitator is a routine', () => {
  expect(isEvent(make({ location: '' }))).toBe(false);
});

test('edge: a daily activity at a venue is still a routine', () => {
  expect(
    isEvent(
      make({ frequency: { count: 1, period: 'day' }, location: 'Elyx gym' }),
    ),
  ).toBe(false);
});
