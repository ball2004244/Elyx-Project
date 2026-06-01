/**
 * @file Pure presentation-layer transforms: turn the raw scheduler output into
 * view models the calendar components render directly. Keeping these here (not
 * in components) makes them unit-testable and keeps the UI declarative.
 */

import { isEvent } from '../scheduler/classify.js';
import { dayKey } from '../scheduler/intervals.js';
import { TYPE_ORDER, DAY_PARTS, dayPart } from './encoding.js';

/**
 * Split placed instances into calendar EVENTS vs daily-protocol ROUTINES.
 * Skipped instances (no window) are excluded from both.
 * @param {import('../lib/schemas.js').ScheduledInstance[]} plan
 * @param {Map<string, import('../lib/schemas.js').Activity>} activityById
 * @returns {{ events: object[], routines: object[] }}
 */
export function splitPlan(plan, activityById) {
  const events = [];
  const routines = [];
  for (const inst of plan) {
    if (!inst.window) continue;
    const a = activityById.get(inst.activityId);
    (a && isEvent(a) ? events : routines).push(inst);
  }
  return { events, routines };
}

/**
 * Collapse repeated instances of the SAME activity on the SAME day into one
 * row carrying a count (e.g. daily sauna ×1, or a 2x/day event ×2).
 * @param {import('../lib/schemas.js').ScheduledInstance[]} dayInstances
 * @returns {object[]} one entry per activity, sorted by first start time.
 */
export function dedupeDay(dayInstances) {
  const byActivity = new Map();
  for (const inst of dayInstances) {
    const cur = byActivity.get(inst.activityId);
    if (cur) {
      cur.count += 1;
      if (inst.window.start < cur.window.start) cur.window = inst.window;
      if (inst.kind === 'backup') cur.kind = 'backup';
    } else {
      byActivity.set(inst.activityId, {
        activityId: inst.activityId,
        kind: inst.kind,
        window: inst.window,
        isRemote: inst.isRemote,
        facilitatorId: inst.facilitatorId,
        equipmentIds: inst.equipmentIds,
        metrics: inst.metrics,
        note: inst.note,
        reason: inst.reason,
        backupId: inst.backupId,
        count: 1,
        _key: `${inst.activityId}-${dayKey(inst.window.start)}`,
      });
    }
  }
  return [...byActivity.values()].sort((a, b) =>
    a.window.start.localeCompare(b.window.start),
  );
}

/**
 * Split a day's deduped event rows into Morning / Afternoon / Evening bands
 * (in order), so an agenda column shows daily rhythm and free time without a
 * full hour-grid. Returns every band (empty ones included) for stable layout.
 * @param {object[]} dayRows  output of dedupeDay
 * @returns {{ key: string, label: string, items: object[] }[]}
 */
export function bandByDayPart(dayRows) {
  return DAY_PARTS.map((band) => ({
    key: band.key,
    label: band.label,
    items: dayRows.filter((r) => dayPart(r.window.start) === band.key),
  }));
}

/**
 * Build the constant Daily Routine from routine instances: one row per distinct
 * routine activity, grouped by activity type, with the prescribed cadence label.
 * Deduped across the whole horizon (the protocol is largely the same each day).
 * @param {import('../lib/schemas.js').ScheduledInstance[]} routines
 * @param {Map<string, import('../lib/schemas.js').Activity>} activityById
 * @returns {{ type: string, items: object[] }[]}
 */
export function buildDailyProtocol(routines, activityById) {
  const seen = new Map();
  for (const inst of routines) {
    if (seen.has(inst.activityId)) continue;
    const a = activityById.get(inst.activityId);
    if (!a) continue;
    seen.set(inst.activityId, {
      id: a.id,
      type: a.activityType,
      details: a.details,
      label: shortLabel(a.details) || a.id,
      cadence: cadenceLabel(a.frequency),
    });
  }
  const groups = TYPE_ORDER.map((type) => ({
    type,
    items: [...seen.values()]
      .filter((it) => it.type === type)
      .sort((a, b) => a.id.localeCompare(b.id)),
  })).filter((g) => g.items.length > 0);
  return groups;
}

/** "3x / week", "1x / day", etc. */
export function cadenceLabel(freq) {
  return `${freq.count}x / ${freq.period}`;
}

/**
 * A short, glanceable label from a long activity `details` string: the first
 * clause, trimmed and capped. Full text stays available as a tooltip. Turns
 * "Brisk outdoor walk, 30-40 min at 100-120 steps/min, ..." into "Brisk
 * outdoor walk".
 * @param {string} details
 * @returns {string}
 */
export function shortLabel(details) {
  if (!details) return '';
  const clause = String(details)
    .split(/[,;:.]/)[0]
    .trim();
  return clause.length > 42 ? `${clause.slice(0, 40).trim()}…` : clause;
}

/**
 * Tag each day's deduped events with `_type` (activity type) so the month grid
 * can render type-colored dots without re-looking-up activities.
 * @param {Map<string, object[]>} eventsByDay
 * @param {Map<string, import('../lib/schemas.js').Activity>} activityById
 * @returns {Map<string, object[]>}
 */
export function tagEventsForMonth(eventsByDay, activityById) {
  const out = new Map();
  for (const [day, items] of eventsByDay) {
    out.set(
      day,
      items.map((e) => ({
        ...e,
        _type: activityById.get(e.activityId)?.activityType ?? 'consultation',
      })),
    );
  }
  return out;
}

/** Plain-language labels + explanations for skip reasons (decision D34). */
export const REASON_INFO = {
  'travel-blocked': {
    label: 'Member traveling',
    explanation: 'On-site activities cannot run while the member is abroad.',
  },
  'no-provider-available': {
    label: 'No specialist',
    explanation: 'No qualifying facilitator had an open slot.',
  },
  'daily-cap-reached': {
    label: 'Daily workload limit',
    explanation: 'The day already held the maximum number of events.',
  },
  'equipment-unavailable': {
    label: 'Equipment busy or down',
    explanation: 'Required equipment was booked or under maintenance.',
  },
  'venue-unavailable': {
    label: 'Venue closed',
    explanation: 'The gym or clinic was unavailable at that time.',
  },
  'member-busy': {
    label: 'No free time',
    explanation: 'The member had no open slot around the target time.',
  },
  'outside-validity-window': {
    label: 'Outside active window',
    explanation: 'The activity was not active on that date.',
  },
};

/** Human label for a raw skip/fail reason code. */
export function reasonLabel(reason) {
  if (!reason) return '';
  return REASON_INFO[reason]?.label ?? reason;
}

/**
 * Build a human-readable substitution note for a backup instance, e.g.
 * "Swapped for Dumbbell goblet squat — Elyx gym was unavailable".
 * @param {import('../lib/schemas.js').ScheduledInstance} inst
 * @param {Map<string, import('../lib/schemas.js').Activity>} activityById
 * @returns {string}
 */
export function substitutionNote(inst, activityById) {
  if (inst.kind !== 'backup') return '';
  const backup = inst.backupId ? activityById.get(inst.backupId) : null;
  const what = backup?.details ?? inst.backupId ?? 'a backup';
  const why = reasonLabel(inst.reason).toLowerCase();
  return why ? `Swapped for "${what}": ${why}` : `Swapped for "${what}"`;
}

/**
 * Group skipped instances by REASON (not activity), each with a plain-language
 * label/explanation, a total count, and the affected activities. Sorted by
 * count descending. Answers "why are there so many skips?".
 * @param {import('../lib/schemas.js').ScheduledInstance[]} plan
 * @param {Map<string, import('../lib/schemas.js').Activity>} activityById
 * @returns {object[]}
 */
export function groupSkippedByReason(plan, activityById) {
  const byReason = new Map();
  for (const inst of plan) {
    if (inst.kind !== 'skipped') continue;
    const reason = inst.reason || 'unknown';
    if (!byReason.has(reason)) {
      byReason.set(reason, { reason, count: 0, byActivity: new Map() });
    }
    const g = byReason.get(reason);
    g.count += 1;
    const cur = g.byActivity.get(inst.activityId);
    if (cur) {
      cur.count += 1;
    } else {
      const a = activityById.get(inst.activityId);
      g.byActivity.set(inst.activityId, {
        activityId: inst.activityId,
        type: a?.activityType ?? 'consultation',
        details: a?.details ?? inst.activityId,
        label: shortLabel(a?.details) || inst.activityId,
        count: 1,
      });
    }
  }
  return [...byReason.values()]
    .map((g) => ({
      reason: g.reason,
      label: REASON_INFO[g.reason]?.label ?? g.reason,
      explanation: REASON_INFO[g.reason]?.explanation ?? '',
      count: g.count,
      items: [...g.byActivity.values()].sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Summarize the loaded resource bank (the closed-world cast, D13/D49) for the
 * welcome page so the user sees WHAT the plan is scheduled against. Read-only:
 * the bank is fixed; only the action-plan request is customizable (D47).
 *
 * Groups providers by role (with a count) and venues by location, plus remote
 * capability — the facts that explain why instances place or skip.
 * @param {import('../lib/schemas.js').Constraints} constraints
 * @returns {{
 *   venues: { location: string, items: string[] }[],
 *   team: { role: string, count: number, remote: boolean }[],
 *   totals: { equipment: number, specialists: number, alliedHealth: number },
 * }}
 */
export function buildBankSummary(constraints) {
  const { equipment = [], specialists = [], alliedHealth = [] } = constraints;

  // Venues: group equipment by location into a name list.
  const byVenue = new Map();
  for (const e of equipment) {
    const loc = e.location || 'other';
    if (!byVenue.has(loc)) byVenue.set(loc, []);
    byVenue.get(loc).push(e.name);
  }
  const venues = [...byVenue.entries()]
    .map(([location, items]) => ({ location, items: items.sort() }))
    .sort((a, b) => a.location.localeCompare(b.location));

  // Care team: group specialists + allied health by role, count providers,
  // and mark whether ANY provider of that role can work remotely.
  const byRole = new Map();
  for (const p of [...specialists, ...alliedHealth]) {
    if (!byRole.has(p.role)) {
      byRole.set(p.role, { role: p.role, count: 0, remote: false });
    }
    const g = byRole.get(p.role);
    g.count += 1;
    if (p.remoteOk) g.remote = true;
  }
  const team = [...byRole.values()].sort((a, b) =>
    a.role.localeCompare(b.role),
  );

  return {
    venues,
    team,
    totals: {
      equipment: equipment.length,
      specialists: specialists.length,
      alliedHealth: alliedHealth.length,
    },
  };
}
