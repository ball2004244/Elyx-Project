/**
 * @file Event vs routine classification (decision D23, refined D30).
 *
 * EVENT = an appointment-like commitment: resource/venue-bound (a facilitator
 * OR a booked venue) AND at appointment cadence (week / month / year). Events
 * occupy calendar slots, are spaced apart, and count against the daily cap.
 *
 * ROUTINE = everything else: self-directed activities, AND anything at DAILY
 * cadence (meals, meds, photo-logs, water). Daily items are routine by nature
 * even when a facilitator reviews them asynchronously — you do not book a coach
 * to photograph lunch. Routines are spread but never capped or skipped for load.
 */

const VENUE_VALUES = new Set(['elyx gym', 'elyx clinic']);

/**
 * @param {import('../lib/schemas.js').Activity} activity
 * @returns {boolean} true if the activity is a calendar EVENT.
 */
export function isEvent(activity) {
  // Daily-cadence activities are routines regardless of a nominal facilitator.
  if (activity.frequency.period === 'day') return false;

  if (activity.facilitator.type !== 'self') return true;
  const loc = (activity.location ?? '').trim().toLowerCase();
  return VENUE_VALUES.has(loc);
}
