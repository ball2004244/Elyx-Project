/**
 * @file The Resource Allocator scheduler core.
 *
 * Walks the Action Plan in priority order and places each activity's required
 * instances into time slots where ALL constraints hold simultaneously. The
 * member is a capacity-1 resource (nothing overlaps for them). Resource/venue
 * EVENTS additionally respect a per-day workload cap and an inter-event buffer;
 * self-directed ROUTINES (meals, meds) are spread across the day but exempt
 * from cap/buffer so they are never wrongly skipped.
 *
 * Falls back to backup activities, then to a logged skip-adjustment. Greedy:
 * higher-priority activities reserve contested resources first (the 3 Forces —
 * member fit, resource availability, health efficacy — resolved by priority).
 */

import { buildResourceIndex } from './resourceIndex.js';
import {
  targetPlacements,
  candidateMinutesFrom,
  DURATION_MIN,
} from './slots.js';
import { isEvent } from './classify.js';
import { MAX_EVENTS_PER_DAY, EVENT_BUFFER_MIN } from './config.js';
import { isoAtMinutes, addMinutes, toMs } from './intervals.js';

/** Failure reasons for an unplaceable instance (explainability, decision b). */
export const FAIL = {
  MEMBER_BUSY: 'member-busy',
  TRAVEL: 'travel-blocked',
  VENUE: 'venue-unavailable',
  PROVIDER: 'no-provider-available',
  DAILY_CAP: 'daily-cap-reached',
};

/**
 * Try to place ONE instance of `activity` on `day`, searching outward from
 * `anchorMin`. `asEvent` controls member-exclusivity semantics (cap, buffer,
 * member booking) and defaults to the activity's own classification; when an
 * activity substitutes a backup, the ORIGINAL activity's nature is passed so a
 * substituted event still occupies the member's exclusive slot. Returns a
 * placement object or { fail } with a reason.
 */
function tryPlaceOnDay(
  index,
  activity,
  day,
  anchorMin,
  commit,
  asEvent = isEvent(activity),
  policy = {
    maxEventsPerDay: MAX_EVENTS_PER_DAY,
    eventBufferMin: EVENT_BUFFER_MIN,
  },
) {
  const duration = DURATION_MIN[activity.activityType] ?? 30;
  const event = asEvent;
  let lastFail = FAIL.MEMBER_BUSY;

  // Workload cap applies to events only.
  if (
    event &&
    index.eventCountOn(`${day}T00:00:00`) >= policy.maxEventsPerDay
  ) {
    return { fail: FAIL.DAILY_CAP };
  }

  for (const minutes of candidateMinutesFrom(anchorMin)) {
    const start = isoAtMinutes(day, minutes);
    const end = addMinutes(start, duration);

    if (event) {
      // Events occupy the member exclusively: clear of commitments, of other
      // placed activities, and buffered from other events.
      if (!index.isMemberFree(start, end) || index.isMemberBooked(start, end)) {
        lastFail = FAIL.MEMBER_BUSY;
        continue;
      }
      if (index.eventTooClose(start, end, policy.eventBufferMin)) {
        lastFail = FAIL.MEMBER_BUSY;
        continue;
      }
    } else {
      // Routines (meals, meds, water) are checklist-like: they must not sit on
      // top of a hard commitment, but they do NOT consume an exclusive member
      // slot or contend with each other (capping/blocking these would wrongly
      // skip medication). They anchor near the intended time and accept it.
      if (!index.isMemberFree(start, end)) {
        lastFail = FAIL.MEMBER_BUSY;
        continue;
      }
    }

    const traveling = index.travelAt(start, end);
    const needsFacilitator = activity.facilitator.type !== 'self';

    if (traveling) {
      // On-site (venue) and in-person facilitation are out while traveling;
      // only remote-capable activities survive.
      if (event && !activity.remoteCapable) {
        lastFail = FAIL.TRAVEL;
        continue;
      }
    }

    // Equipment is modeled at VENUE level, derived from the activity location.
    if (!index.isVenueOpen(activity.location, start, end)) {
      lastFail = FAIL.VENUE;
      continue;
    }

    let provider = null;
    if (needsFacilitator) {
      const needRemote = Boolean(traveling) && activity.remoteCapable;
      provider = index.findProvider(
        activity.facilitator,
        start,
        end,
        needRemote,
      );
      if (!provider) {
        lastFail = FAIL.PROVIDER;
        continue;
      }
    }

    // Valid slot. Only EVENTS occupy the member's exclusive timeline; routines
    // are checklist items and do not book member time.
    if (commit) {
      if (provider) index.bookProvider(provider.meta.id, start, end);
      if (event) {
        index.bookMember(start, end);
        index.bookEvent(start, end);
      }
    }

    return {
      window: { start, end },
      facilitatorId: provider ? provider.meta.id : null,
      isRemote: Boolean(traveling) && activity.remoteCapable,
      equipmentIds: [],
    };
  }

  return { fail: lastFail };
}

/**
 * Schedule the whole Action Plan against the Constraints.
 *
 * @param {import('../lib/schemas.js').Activity[]} actionPlan
 * @param {import('../lib/schemas.js').Constraints} constraints
 * @param {{ startDay: string, endDay: string }} range inclusive day bounds
 * @param {{ maxEventsPerDay?: number, eventBufferMin?: number }} [opts]
 *   tunable workload policy (defaults from config.js)
 * @returns {import('../lib/schemas.js').ScheduledInstance[]}
 */
export function schedule(actionPlan, constraints, range, opts = {}) {
  const policy = {
    maxEventsPerDay: opts.maxEventsPerDay ?? MAX_EVENTS_PER_DAY,
    eventBufferMin: opts.eventBufferMin ?? EVENT_BUFFER_MIN,
  };
  const index = buildResourceIndex(constraints);
  const byId = new Map(actionPlan.map((a) => [a.id, a]));

  const ordered = [...actionPlan].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );

  /** @type {import('../lib/schemas.js').ScheduledInstance[]} */
  const plan = [];

  for (const activity of ordered) {
    const placements = targetPlacements(activity, range.startDay, range.endDay);

    for (const { day, anchorMin } of placements) {
      const placed = tryPlaceOnDay(
        index,
        activity,
        day,
        anchorMin,
        true,
        isEvent(activity),
        policy,
      );

      if (placed.window) {
        plan.push({
          activityId: activity.id,
          kind: 'primary',
          window: placed.window,
          facilitatorId: placed.facilitatorId,
          equipmentIds: placed.equipmentIds,
          isRemote: placed.isRemote,
          metrics: activity.metrics,
          note: '',
        });
        continue;
      }

      // Primary failed: try backup activities that resolve to known ids. A
      // substituted backup keeps the ORIGINAL activity's event nature so a
      // substituted event still reserves the member's exclusive slot.
      let substituted = false;
      const originalIsEvent = isEvent(activity);
      for (const backupId of activity.backups) {
        const backup = byId.get(backupId);
        if (!backup) continue;
        const alt = tryPlaceOnDay(
          index,
          backup,
          day,
          anchorMin,
          true,
          originalIsEvent,
          policy,
        );
        if (alt.window) {
          plan.push({
            activityId: activity.id,
            kind: 'backup',
            window: alt.window,
            facilitatorId: alt.facilitatorId,
            equipmentIds: alt.equipmentIds,
            isRemote: alt.isRemote,
            metrics: activity.metrics,
            note: '',
            reason: placed.fail,
            backupId: backup.id,
          });
          substituted = true;
          break;
        }
      }
      if (substituted) continue;

      plan.push({
        activityId: activity.id,
        kind: 'skipped',
        window: null,
        facilitatorId: null,
        equipmentIds: [],
        isRemote: false,
        metrics: activity.metrics,
        note: activity.skipAdjustment ?? '',
        reason: placed.fail,
        backupId: null,
        day,
      });
    }
  }

  plan.sort((a, b) => {
    if (a.window && b.window)
      return toMs(a.window.start) - toMs(b.window.start);
    if (a.window) return -1;
    if (b.window) return 1;
    return 0;
  });

  return plan;
}
