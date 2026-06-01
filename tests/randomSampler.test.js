/**
 * Tests for src/lib/randomSampler.js — the client-side Action Plan sampler that
 * replaced the LLM path in the UI (D55). Structured by the 3-3-3 rule.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import {
  sampleRandomActionPlan,
  typeCounts,
  DEFAULT_DISTRIBUTION,
} from '../src/lib/randomSampler.js';
import { Activity } from '../src/lib/schemas.js';

/* ---- Happy: typical generation ------------------------------------------ */

test('happy: produces the requested number of schema-valid activities', () => {
  const plan = sampleRandomActionPlan({ total: 100, seed: 1 });
  expect(plan).toHaveLength(100);
  for (const a of plan) expect(Activity.safeParse(a).success).toBe(true);
});

test('happy: ids are contiguous act-001.. and unique', () => {
  const plan = sampleRandomActionPlan({ total: 40, seed: 2 });
  const ids = plan.map((a) => a.id);
  expect(ids[0]).toBe('act-001');
  expect(ids[39]).toBe('act-040');
  expect(new Set(ids).size).toBe(40);
});

test('happy: typeCounts hits the exact total and honors the mix', () => {
  const counts = typeCounts(100, DEFAULT_DISTRIBUTION);
  const sum = Object.values(counts).reduce((n, c) => n + c, 0);
  expect(sum).toBe(100);
  expect(counts.fitness).toBeGreaterThan(counts.medication);
});

/* ---- Hard: distribution shape + content quality ------------------------- */

test('hard: priority is bell-shaped (mid values dominate the tails)', () => {
  const plan = sampleRandomActionPlan({ total: 300, seed: 7 });
  const mid = plan.filter((a) => a.priority >= 4 && a.priority <= 7).length;
  const tails = plan.filter((a) => a.priority <= 2 || a.priority >= 9).length;
  expect(mid).toBeGreaterThan(tails); // clustered middle, like the bundled CSV
});

test('hard: every facilitated activity references a non-empty role', () => {
  const plan = sampleRandomActionPlan({ total: 120, seed: 9 });
  for (const a of plan) {
    if (a.facilitator.type !== 'self') {
      expect(typeof a.facilitator.role).toBe('string');
      expect(a.facilitator.role.length).toBeGreaterThan(0);
    }
  }
});

test('hard: details lead with a name (shortLabel-friendly, D45)', () => {
  const plan = sampleRandomActionPlan({ total: 60, seed: 11 });
  const allow = /eye exercise|mobility|posture|breath|stretch|hydration|walk/i;
  for (const a of plan) {
    // Each details is "Name: guidance" — the part before ":" is a clean label.
    const head = a.details.split(':')[0];
    expect(head.length).toBeGreaterThan(0);
    expect(head).not.toMatch(/^(when|drink|confine|audit)\b/i); // not a fragment
    // Implausible activities (strength/cardio/massage/consult) are never >1x/day.
    if (a.frequency.period === 'day' && a.frequency.count > 1) {
      const ok =
        a.activityType === 'food' ||
        a.activityType === 'medication' ||
        allow.test(head);
      expect(ok).toBe(true);
    }
  }
});

/* ---- Edge: bounds, determinism, distribution edges ---------------------- */

test('edge: a fixed seed reproduces the exact same plan', () => {
  const a = sampleRandomActionPlan({ total: 50, seed: 123 });
  const b = sampleRandomActionPlan({ total: 50, seed: 123 });
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

test('edge: zero-weight types are omitted from the plan', () => {
  const plan = sampleRandomActionPlan({
    total: 30,
    seed: 5,
    distribution: {
      fitness: 1,
      food: 1,
      medication: 0,
      therapy: 0,
      consultation: 0,
    },
  });
  const types = new Set(plan.map((a) => a.activityType));
  expect(types.has('medication')).toBe(false);
  expect(types.has('fitness')).toBe(true);
  expect(types.has('food')).toBe(true);
});

test('edge: small / zero totals respect the exact count (no min-1 floor)', () => {
  // Regression for the floor bug: total<5 used to over-produce (1 per type).
  expect(sampleRandomActionPlan({ total: 0 }).length).toBe(0);
  expect(sampleRandomActionPlan({ total: 3, seed: 3 }).length).toBe(3);
  expect(typeCounts(0)).toEqual({
    fitness: 0,
    food: 0,
    medication: 0,
    therapy: 0,
    consultation: 0,
  });
  // All-zero distribution must not crash and yields no activities.
  expect(
    typeCounts(50, {
      fitness: 0,
      food: 0,
      medication: 0,
      therapy: 0,
      consultation: 0,
    }),
  ).toEqual({});
  // A small but non-zero total stays in-range and exact.
  const plan = sampleRandomActionPlan({ total: 5, seed: 3 });
  expect(plan).toHaveLength(5);
  for (const a of plan) {
    expect(a.priority).toBeGreaterThanOrEqual(1);
    expect(a.priority).toBeLessThanOrEqual(10);
  }
});
