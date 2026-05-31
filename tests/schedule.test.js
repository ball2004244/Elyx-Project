/**
 * Integration tests for the scheduler core (src/scheduler/schedule.js) against
 * the real generated datasets. Covers typical placement, role-based
 * substitution, travel-driven skips, routine exemption, and scale/perf.
 */

import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/lib/csv.js';
import { rowToActivity } from '../src/lib/actionPlanCsv.js';
import {
  fromConstraintCsvs,
  CONSTRAINT_FILES,
} from '../src/lib/constraintsCsv.js';
import { schedule } from '../src/scheduler/schedule.js';
import { deriveHorizon, filterToRange } from '../src/scheduler/index.js';
import { isEvent } from '../src/scheduler/classify.js';
import { MAX_EVENTS_PER_DAY } from '../src/scheduler/config.js';
import { PersonalizedPlan } from '../src/lib/schemas.js';

const DATA = join(import.meta.dir, '..', 'src', 'data');

function loadActionPlan() {
  return parseCsv(readFileSync(join(DATA, 'action_plan.csv'), 'utf8')).map(
    rowToActivity,
  );
}
function loadConstraints() {
  return fromConstraintCsvs({
    resources: readFileSync(join(DATA, CONSTRAINT_FILES.resources), 'utf8'),
    resourceWindows: readFileSync(
      join(DATA, CONSTRAINT_FILES.resourceWindows),
      'utf8',
    ),
    clientSchedule: readFileSync(
      join(DATA, CONSTRAINT_FILES.clientSchedule),
      'utf8',
    ),
    travel: readFileSync(join(DATA, CONSTRAINT_FILES.travel), 'utf8'),
  });
}

const plan = loadActionPlan();
const constraints = loadConstraints();
const horizon = deriveHorizon(constraints);

/* ---- Happy: core scheduling succeeds ------------------------------------ */

test('happy: deriveHorizon spans the 3-month program', () => {
  expect(horizon.startDay).toBe('2026-06-01');
  expect(horizon.endDay).toBe('2026-08-31');
});

test('happy: schedule output validates against the PersonalizedPlan schema', () => {
  const result = schedule(plan, constraints, horizon);
  expect(() => PersonalizedPlan.parse(result)).not.toThrow();
  expect(result.length).toBeGreaterThan(0);
});

test('happy: most instances are placed; some skips are expected (friction)', () => {
  const result = schedule(plan, constraints, horizon);
  const placed = result.filter((i) => i.window);
  const skipped = result.filter((i) => i.kind === 'skipped');
  const backup = result.filter((i) => i.kind === 'backup');
  expect(placed.length).toBeGreaterThan(skipped.length);
  expect(skipped.length).toBeGreaterThan(0);
  expect(backup.length).toBeGreaterThan(0); // substitution fires somewhere
  // The deliberately-hard daily clinic sauna must adapt (backup or skip), not
  // always run as primary, on travel / clinic-closed days.
  const sauna = result.filter((i) => i.activityId === 'act-113');
  expect(sauna.some((i) => i.kind !== 'primary')).toBe(true);
});

/* ---- Hard: invariants on real, contested data --------------------------- */

test('hard: placed instances never double-book a provider', () => {
  const result = schedule(plan, constraints, horizon);
  const byProvider = new Map();
  for (const i of result) {
    if (!i.window || !i.facilitatorId) continue;
    if (!byProvider.has(i.facilitatorId)) byProvider.set(i.facilitatorId, []);
    byProvider.get(i.facilitatorId).push(i.window);
  }
  for (const windows of byProvider.values()) {
    windows.sort((a, b) => a.start.localeCompare(b.start));
    for (let k = 1; k < windows.length; k++) {
      expect(windows[k].start >= windows[k - 1].end).toBe(true);
    }
  }
});

test('hard: placed instances never double-book equipment', () => {
  const result = schedule(plan, constraints, horizon);
  const byEquip = new Map();
  for (const i of result) {
    if (!i.window) continue;
    for (const eq of i.equipmentIds) {
      if (!byEquip.has(eq)) byEquip.set(eq, []);
      byEquip.get(eq).push(i.window);
    }
  }
  for (const windows of byEquip.values()) {
    windows.sort((a, b) => a.start.localeCompare(b.start));
    for (let k = 1; k < windows.length; k++) {
      expect(windows[k].start >= windows[k - 1].end).toBe(true);
    }
  }
});

test('hard: events never overlap on the member timeline and respect the cap', () => {
  const result = schedule(plan, constraints, horizon);
  const byId = new Map(plan.map((a) => [a.id, a]));

  // ALL placed events (primary OR backup) share the member's exclusive
  // timeline, so none may overlap — a substituted event still reserves its slot.
  const eventWins = result
    .filter((i) => i.window && isEvent(byId.get(i.activityId)))
    .map((i) => i.window)
    .sort((a, b) => a.start.localeCompare(b.start));
  for (let k = 1; k < eventWins.length; k++) {
    expect(eventWins[k].start >= eventWins[k - 1].end).toBe(true);
  }

  // No day exceeds the workload cap (primary events only — backups also count
  // against the member but the cap is enforced on placement).
  const perDay = new Map();
  for (const w of eventWins) {
    const d = w.start.slice(0, 10);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  for (const n of perDay.values()) {
    expect(n).toBeLessThanOrEqual(MAX_EVENTS_PER_DAY);
  }

  // Events are spread roughly uniformly across weekdays (no Monday pile-up):
  // the busiest weekday holds < 35% of all events (uniform would be ~14%).
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const w of eventWins) {
    byWeekday[new Date(`${w.start}Z`).getUTCDay()] += 1;
  }
  const busiest = Math.max(...byWeekday);
  expect(busiest).toBeLessThan(eventWins.length * 0.35);
});

/* ---- Edge: routine exemption, view filter, scale ------------------------ */

test('edge: routines are not capped (daily meds/meals never skip for load)', () => {
  const result = schedule(plan, constraints, horizon);
  const byId = new Map(plan.map((a) => [a.id, a]));
  // No routine (non-event) instance is skipped for the daily workload cap.
  const cappedRoutines = result.filter(
    (i) =>
      i.kind === 'skipped' &&
      !isEvent(byId.get(i.activityId)) &&
      String(i.note).startsWith('daily-cap-reached'),
  );
  expect(cappedRoutines).toHaveLength(0);
});

test('edge: filterToRange narrows the plan to one week', () => {
  const result = schedule(plan, constraints, horizon);
  const week = filterToRange(result, '2026-06-01', '2026-06-07');
  expect(week.length).toBeGreaterThan(0);
  for (const i of week) {
    expect(i.window.start >= '2026-06-01').toBe(true);
    expect(i.window.start <= '2026-06-07T23:59:59').toBe(true);
  }
});

test('edge: scheduling the full horizon completes quickly', () => {
  const t0 = performance.now();
  schedule(plan, constraints, horizon);
  expect(performance.now() - t0).toBeLessThan(2000);
});
