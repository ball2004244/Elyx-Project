/**
 * Tests for src/lib/distribute.js — the shared largest-remainder integer split
 * that replaced three drifting copies. Structured by the 3-3-3 rule.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import { largestRemainder } from '../src/lib/distribute.js';

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/* ---- Happy: typical splits ---------------------------------------------- */

test('happy: parts sum exactly to the total', () => {
  const out = largestRemainder({ a: 40, b: 20, c: 15, d: 15, e: 10 }, 100);
  expect(sum(out)).toBe(100);
});

test('happy: weights need not sum to 1 (proportional)', () => {
  const out = largestRemainder({ a: 1, b: 1, c: 1 }, 9);
  expect(out).toEqual({ a: 3, b: 3, c: 3 });
});

test('happy: larger weight gets a larger share', () => {
  const out = largestRemainder({ big: 80, small: 20 }, 10);
  expect(out.big).toBeGreaterThan(out.small);
  expect(sum(out)).toBe(10);
});

/* ---- Hard: remainder distribution + tie behavior ------------------------ */

test('hard: leftover from flooring is distributed by largest remainder', () => {
  // 10 split 1:1:1 → 3.33 each → floors 3,3,3 = 9, one leftover to first.
  const out = largestRemainder({ a: 1, b: 1, c: 1 }, 10);
  expect(sum(out)).toBe(10);
  expect(Math.max(...Object.values(out))).toBe(4);
  expect(Math.min(...Object.values(out))).toBe(3);
});

test('hard: a tiny-weight key may legitimately round to 0', () => {
  const out = largestRemainder({ dominant: 99, tiny: 1 }, 10);
  expect(out.tiny).toBe(0);
  expect(out.dominant).toBe(10);
});

test('hard: never overshoots the total even with many keys', () => {
  const out = largestRemainder({ a: 7, b: 3, c: 11, d: 2, e: 5 }, 13);
  expect(sum(out)).toBe(13);
});

/* ---- Edge: degenerate inputs -------------------------------------------- */

test('edge: total <= 0 yields all-zero counts (no forced min-1)', () => {
  expect(largestRemainder({ a: 1, b: 1 }, 0)).toEqual({ a: 0, b: 0 });
  expect(largestRemainder({ a: 1 }, -5)).toEqual({ a: 0 });
});

test('edge: zero/negative-weight keys are omitted entirely', () => {
  const out = largestRemainder({ a: 5, b: 0, c: -3 }, 10);
  expect(out).toEqual({ a: 10 });
});

test('edge: empty or all-zero weights yield an empty result', () => {
  expect(largestRemainder({}, 10)).toEqual({});
  expect(largestRemainder({ a: 0, b: 0 }, 10)).toEqual({});
});
