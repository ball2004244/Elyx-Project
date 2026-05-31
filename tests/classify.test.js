/**
 * Tests for event vs self-care classification (src/scheduler/classify.js).
 * Classification is by RESOURCE-BINDING (needs a person/venue), independent of
 * cadence. Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
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

test('hard: a DAILY facilitated activity is an event (resource-bound)', () => {
  // Cadence-independent: a daily session that needs a provider still contends
  // for a slot. (Self-administered daily logs should be modeled as self.)
  expect(
    isEvent(
      make({
        frequency: { count: 3, period: 'day' },
        facilitator: { type: 'alliedHealth', role: 'physiotherapist' },
      }),
    ),
  ).toBe(true);
});

/* ---- Edge: casing / empty / daily venue --------------------------------- */

test('edge: venue match is case-insensitive (weekly)', () => {
  expect(isEvent(make({ location: 'ELYX GYM' }))).toBe(true);
});

test('edge: empty location with self facilitator is a routine', () => {
  expect(isEvent(make({ location: '' }))).toBe(false);
});

test('edge: a self-administered activity is self-care at ANY cadence', () => {
  // A weekly/monthly self med must NOT be an event (never wrongly capped).
  expect(
    isEvent(
      make({ frequency: { count: 1, period: 'month' }, location: 'home' }),
    ),
  ).toBe(false);
  expect(
    isEvent(make({ frequency: { count: 1, period: 'day' }, location: 'home' })),
  ).toBe(false);
});
