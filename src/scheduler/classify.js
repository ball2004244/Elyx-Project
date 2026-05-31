/**
 * @file Event vs self-care classification (decisions D23, D43).
 *
 * EVENT = resource-bound: the activity needs a specific PERSON (facilitator) or
 * a booked VENUE (Elyx gym / clinic). These occupy an exclusive member slot,
 * are spaced apart, and count against the daily cap — because the member can't
 * be two places at once and a provider/room can't host two things at once.
 *
 * SELF-CARE = everything the member performs alone with no scarce resource
 * (meals, meds, water, home workouts) — at ANY cadence. These are flexible:
 * spread across the day but never capped or skipped for lack of room. Keying on
 * resource-binding (not cadence) is robust to noisy data: a self-administered
 * medication is never an event even if weekly/monthly, so it is never wrongly
 * capped; a provider-administered treatment is always an event.
 */

const VENUE_VALUES = new Set(['elyx gym', 'elyx clinic']);

/**
 * @param {import('../lib/schemas.js').Activity} activity
 * @returns {boolean} true if the activity is a resource-bound EVENT.
 */
export function isEvent(activity) {
  if (activity.facilitator.type !== 'self') return true;
  const loc = (activity.location ?? '').trim().toLowerCase();
  return VENUE_VALUES.has(loc);
}
