/**
 * @file Public scheduler API: load data, derive the horizon, run the engine,
 * and filter the resulting plan to a view window (e.g. one week).
 */

import { dayKey, overlaps, toMs } from './intervals.js';

export { schedule, FAIL } from './schedule.js';
export { buildResourceIndex } from './resourceIndex.js';
export { targetPlacements, DURATION_MIN } from './slots.js';

/**
 * Derive the inclusive [startDay, endDay] horizon from the constraint data:
 * the earliest availability start to the latest availability end. Falls back to
 * the client schedule / travel if no resource windows exist.
 *
 * @param {import('../lib/schemas.js').Constraints} constraints
 * @returns {{ startDay: string, endDay: string }}
 */
export function deriveHorizon(constraints) {
  let min = Infinity;
  let max = -Infinity;
  const consider = (iso) => {
    const ms = toMs(iso);
    if (ms < min) min = ms;
    if (ms > max) max = ms;
  };
  for (const r of [
    ...constraints.equipment,
    ...constraints.specialists,
    ...constraints.alliedHealth,
  ]) {
    for (const w of r.availability) {
      consider(w.start);
      consider(w.end);
    }
  }
  for (const e of constraints.clientSchedule) consider(e.start);
  for (const t of constraints.travel) consider(t.start);

  if (min === Infinity) {
    const today = dayKey(new Date().toISOString());
    return { startDay: today, endDay: today };
  }
  return {
    startDay: dayKey(new Date(min).toISOString()),
    endDay: dayKey(new Date(max).toISOString()),
  };
}

/**
 * Keep only scheduled instances whose window overlaps [startDay, endDay]
 * (inclusive). Skipped instances (no window) are dropped from a view filter.
 *
 * @param {import('../lib/schemas.js').ScheduledInstance[]} plan
 * @param {string} startDay "YYYY-MM-DD"
 * @param {string} endDay "YYYY-MM-DD"
 */
export function filterToRange(plan, startDay, endDay) {
  const rangeStart = `${startDay}T00:00:00`;
  const rangeEnd = `${endDay}T23:59:59`;
  return plan.filter(
    (i) =>
      i.window && overlaps(i.window.start, i.window.end, rangeStart, rangeEnd),
  );
}

/**
 * Group placed instances by day key for calendar rendering.
 * @param {import('../lib/schemas.js').ScheduledInstance[]} plan
 * @returns {Map<string, import('../lib/schemas.js').ScheduledInstance[]>}
 */
export function groupByDay(plan) {
  const map = new Map();
  for (const inst of plan) {
    if (!inst.window) continue;
    const k = dayKey(inst.window.start);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(inst);
  }
  return map;
}

/** Convenience: the 7-day window starting at `startDay` (for the week view). */
export function weekRange(startDay) {
  const ms = toMs(`${startDay}T00:00:00`) + 6 * 86_400_000;
  return { startDay, endDay: dayKey(new Date(ms).toISOString()) };
}

/** First and last day of the calendar month containing `day`. */
export function monthBounds(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const first = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDom = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const last = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDom).padStart(2, '0')}`;
  return { startDay: first, endDay: last };
}
