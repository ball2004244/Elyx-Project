/**
 * @file Turns an activity's frequency into concrete target placements (day +
 * an anchor start time), and provides the candidate-time search order.
 *
 * Anchors prevent the "everything at 05:00" collapse: multiple daily instances
 * are seeded at spread times (morning/noon/evening), and different activities
 * start from different offsets so they fan out across the day.
 */

import { eachDay, weekday } from './intervals.js';
import { DAY_START_MIN, DAY_END_MIN, GRID_MIN } from './config.js';

/** Default session duration (minutes) by activity type. */
export const DURATION_MIN = {
  fitness: 60,
  food: 30,
  medication: 5,
  therapy: 30,
  consultation: 45,
};

/** Stable small integer hash of a string (for per-activity anchor offset). */
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** `n` anchor minutes spread evenly across the active day window. */
function spreadAnchors(n) {
  if (n <= 1) return [DAY_START_MIN];
  const span = DAY_END_MIN - DAY_START_MIN;
  const step = span / (n - 1);
  return Array.from(
    { length: n },
    (_, i) => Math.round((DAY_START_MIN + i * step) / GRID_MIN) * GRID_MIN,
  );
}

/** Pick `count` days evenly across `days`, phase-shifted by `offset` (0..1) so
 * different activities scatter across the week instead of all starting Monday. */
function spreadDays(days, count, offset = 0) {
  if (count >= days.length) return [...days];
  const step = days.length / count;
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.floor((i + offset) * step) % days.length;
    return days[idx];
  });
}

/**
 * Candidate start minutes, searched outward from `anchor` so placement lands
 * near the intended time but can drift when the anchor is busy.
 * @param {number} anchor minutes from midnight
 * @returns {number[]}
 */
export function candidateMinutesFrom(anchor) {
  const grid = [];
  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += GRID_MIN) grid.push(m);
  const start = Math.max(
    DAY_START_MIN,
    Math.min(DAY_END_MIN, Math.round(anchor / GRID_MIN) * GRID_MIN),
  );
  return grid.sort((a, b) => Math.abs(a - start) - Math.abs(b - start));
}

/**
 * Compute target placements for an activity over [startDay, endDay].
 * @param {import('../lib/schemas.js').Activity} activity
 * @param {string} startDay "YYYY-MM-DD"
 * @param {string} endDay "YYYY-MM-DD"
 * @returns {{ day: string, anchorMin: number }[]}
 */
export function targetPlacements(activity, startDay, endDay) {
  const days = eachDay(startDay, endDay);
  if (days.length === 0) return [];
  const { count, period } = activity.frequency;
  const offset = hash(activity.id) % 4; // 0..3 grid steps of per-activity jitter
  const jitter = offset * GRID_MIN;
  // Fractional phase (0..1) shifting WHICH days a weekly/monthly activity uses,
  // so 1x/week activities scatter across all 7 days instead of all on Monday.
  const dayPhase = (hash(activity.id) % 7) / 7;

  if (period === 'day') {
    const anchors = spreadAnchors(count);
    return days.flatMap((day) =>
      anchors.map((a) => ({
        day,
        anchorMin: Math.min(DAY_END_MIN, a + jitter),
      })),
    );
  }

  if (period === 'week') {
    const out = [];
    let week = [];
    const emit = (chunk) => {
      for (const day of spreadDays(chunk, count, dayPhase)) {
        out.push({ day, anchorMin: DAY_START_MIN + jitter });
      }
    };
    for (const d of days) {
      week.push(d);
      if (weekday(d) === 0) {
        emit(week);
        week = [];
      }
    }
    if (week.length) emit(week);
    return out;
  }

  if (period === 'month') {
    const byMonth = new Map();
    for (const d of days) {
      const key = d.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(d);
    }
    return [...byMonth.values()].flatMap((m) =>
      spreadDays(m, count, dayPhase).map((day) => ({
        day,
        anchorMin: DAY_START_MIN + jitter,
      })),
    );
  }

  // period === 'year'
  const instances = Math.max(1, Math.round((count * days.length) / 365));
  return spreadDays(days, instances, dayPhase).map((day) => ({
    day,
    anchorMin: DAY_START_MIN + jitter,
  }));
}
