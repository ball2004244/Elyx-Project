/**
 * @file Mapping between the Activity domain object and a flat CSV row.
 *
 * The Activity schema has nested objects (frequency, facilitator) and arrays
 * (backups, metrics, requiredEquipment). CSV is flat, so:
 *  - nested objects -> flat columns (frequencyCount, facilitatorType, ...)
 *  - arrays         -> single column, items joined by ARRAY_DELIM ("|")
 *
 * Used by both the aggregation script (write) and the app data loader (read),
 * so the round-trip stays DRY and symmetric. Output is re-validated by the
 * Activity Zod schema after parsing.
 */

import { Activity } from './schemas.js';

/** Delimiter for array-valued fields inside one CSV cell. */
export const ARRAY_DELIM = '|';

/** Canonical CSV column order for the action plan. */
export const ACTION_PLAN_COLUMNS = [
  'id',
  'priority',
  'priorityRationale',
  'activityType',
  'frequencyCount',
  'frequencyPeriod',
  'details',
  'facilitatorType',
  'facilitatorRole',
  'facilitatorResourceId',
  'location',
  'remoteCapable',
  'prep',
  'backups',
  'skipAdjustment',
  'metrics',
];

const joinArr = (arr) => (Array.isArray(arr) ? arr.join(ARRAY_DELIM) : '');
const splitArr = (s) =>
  s == null || s === ''
    ? []
    : String(s)
        .split(ARRAY_DELIM)
        .map((x) => x.trim())
        .filter(Boolean);

/**
 * Flatten an Activity into a CSV row object (string-valued).
 * @param {import('./schemas.js').Activity} a
 * @returns {Record<string, string>}
 */
export function activityToRow(a) {
  return {
    id: a.id,
    priority: String(a.priority),
    priorityRationale: a.priorityRationale ?? '',
    activityType: a.activityType,
    frequencyCount: String(a.frequency.count),
    frequencyPeriod: a.frequency.period,
    details: a.details ?? '',
    facilitatorType: a.facilitator.type,
    facilitatorRole: a.facilitator.role ?? '',
    facilitatorResourceId: a.facilitator.resourceId ?? '',
    location: a.location ?? '',
    remoteCapable: a.remoteCapable ? 'true' : 'false',
    prep: a.prep ?? '',
    backups: joinArr(a.backups),
    skipAdjustment: a.skipAdjustment ?? '',
    metrics: joinArr(a.metrics),
  };
}

/**
 * Reconstruct an Activity from a flat CSV row, then validate via Zod.
 * @param {Record<string, string>} r
 * @returns {import('./schemas.js').Activity}
 */
export function rowToActivity(r) {
  const facilitator = { type: r.facilitatorType };
  if (r.facilitatorRole) facilitator.role = r.facilitatorRole;
  if (r.facilitatorResourceId) facilitator.resourceId = r.facilitatorResourceId;

  return Activity.parse({
    id: r.id,
    priority: Number(r.priority),
    priorityRationale: r.priorityRationale ?? '',
    activityType: r.activityType,
    frequency: { count: Number(r.frequencyCount), period: r.frequencyPeriod },
    details: r.details ?? '',
    facilitator,
    location: r.location ?? '',
    remoteCapable: r.remoteCapable === 'true',
    prep: r.prep ?? '',
    backups: splitArr(r.backups),
    skipAdjustment: r.skipAdjustment ?? '',
    metrics: splitArr(r.metrics),
  });
}

/**
 * Parse many CSV rows into Activities, tolerating malformed rows: each bad row
 * is skipped and recorded rather than aborting the whole load. This is the
 * graceful-degradation path for messy input (the strict `rowToActivity` throws
 * per row; this wraps it). Demo data is clean, but real uploads may not be.
 *
 * @param {Record<string, string>[]} rows
 * @returns {{ activities: import('./schemas.js').Activity[],
 *   errors: { row: number, id: string, message: string }[] }}
 */
export function loadActivities(rows) {
  const activities = [];
  const errors = [];
  rows.forEach((r, i) => {
    try {
      activities.push(rowToActivity(r));
    } catch (err) {
      errors.push({
        row: i,
        id: r.id ?? '',
        message: String(err.message ?? err),
      });
    }
  });
  return { activities, errors };
}
