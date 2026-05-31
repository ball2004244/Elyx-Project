/**
 * @file Builds fast lookup structures over the Constraints bundle so the
 * scheduler can test "is everything free at [s,e)?" cheaply, and BOOK resources
 * as it places activities.
 *
 * Design: bucket every window by day key ("YYYY-MM-DD") so each check scans only
 * that day's windows, not the whole 3-month horizon. Bookings accumulate in the
 * same per-day buckets, so later (lower-priority) activities see earlier ones as
 * busy — this is how greedy priority placement reserves contested slots.
 */

import { dayKey, overlaps, contains, toMs } from './intervals.js';

/** Push a window into a Map<dayKey, window[]> bucket. */
function bucketByDay(map, win) {
  const k = dayKey(win.start);
  if (!map.has(k)) map.set(k, []);
  map.get(k).push(win);
}

/** True if [s,e) overlaps any window in the day bucket. */
function overlapsAny(map, s, e) {
  const list = map.get(dayKey(s));
  if (!list) return false;
  return list.some((w) => overlaps(s, e, w.start, w.end));
}

/** True if [s,e) is contained in at least one window in the day bucket. */
function containedInAny(map, s, e) {
  const list = map.get(dayKey(s));
  if (!list) return false;
  return list.some((w) => contains(w.start, w.end, s, e));
}

/**
 * @typedef {object} ResourceIndex
 * @property {(s:string,e:string)=>boolean} isMemberFree
 * @property {(s:string,e:string)=>(null|object)} travelAt
 * @property {(location:string,s:string,e:string)=>boolean} isVenueOpen
 * @property {(spec:object,s:string,e:string,needRemote:boolean)=>(null|object)}
 *   findProvider
 */

/**
 * @param {import('../lib/schemas.js').Constraints} constraints
 * @returns {ResourceIndex}
 */
export function buildResourceIndex(constraints) {
  // Member blocked time (commitments + incidents) bucketed by day.
  const memberBusy = new Map();
  for (const e of constraints.clientSchedule) bucketByDay(memberBusy, e);

  // Travel windows (kept as a flat list; few in number).
  const travel = constraints.travel;

  // Equipment grouped by VENUE (location): a venue is "open" at [s,e) when it
  // has at least one equipment availability window covering the slot and no
  // equipment downtime overlapping it. (KISS: venue-level, not per-item.)
  const venues = new Map();
  for (const eq of constraints.equipment) {
    const loc = (eq.location ?? '').trim().toLowerCase();
    if (!venues.has(loc)) {
      venues.set(loc, { avail: new Map(), downtime: new Map() });
    }
    const v = venues.get(loc);
    for (const w of eq.availability) bucketByDay(v.avail, w);
    for (const w of eq.downtime) bucketByDay(v.downtime, w);
  }

  // Providers (specialists + allied health) indexed by id and by role.
  const providerById = new Map();
  const providersByRole = new Map();
  for (const p of [...constraints.specialists, ...constraints.alliedHealth]) {
    const avail = new Map();
    const downtime = new Map();
    const booked = new Map();
    for (const w of p.availability) bucketByDay(avail, w);
    for (const w of p.downtime) bucketByDay(downtime, w);
    const entry = { meta: p, avail, downtime, booked };
    providerById.set(p.id, entry);
    if (!providersByRole.has(p.role)) providersByRole.set(p.role, []);
    providersByRole.get(p.role).push(entry);
  }

  const isMemberFree = (s, e) => !overlapsAny(memberBusy, s, e);

  // The member's own placed activities (capacity 1). Separate from the static
  // clientSchedule so we can both check and accumulate as we place.
  const memberBooked = new Map();
  const isMemberBooked = (s, e) => overlapsAny(memberBooked, s, e);
  const bookMember = (s, e) => bucketByDay(memberBooked, { start: s, end: e });

  // Events placed on the member timeline, with per-day count + buffer checks.
  const eventBusy = new Map(); // dayKey -> windows
  const eventsPerDay = new Map(); // dayKey -> count
  const eventCountOn = (s) => eventsPerDay.get(dayKey(s)) ?? 0;
  /** True if [s,e) is within `buffer` minutes of any existing event. */
  const eventTooClose = (s, e, bufferMin) => {
    const list = eventBusy.get(dayKey(s));
    if (!list) return false;
    const bufMs = bufferMin * 60_000;
    const s0 = toMs(s);
    const e0 = toMs(e);
    return list.some(
      (w) => s0 < toMs(w.end) + bufMs && toMs(w.start) - bufMs < e0,
    );
  };
  const bookEvent = (s, e) => {
    bucketByDay(eventBusy, { start: s, end: e });
    const k = dayKey(s);
    eventsPerDay.set(k, (eventsPerDay.get(k) ?? 0) + 1);
  };

  const travelAt = (s, e) =>
    travel.find((t) => overlaps(s, e, t.start, t.end)) ?? null;

  /**
   * Is the venue for `location` usable at [s,e)? Non-venue locations (home,
   * outdoor, video call, restaurant) are always open. A tracked venue (Elyx
   * gym / clinic) is open when an equipment availability window covers the slot
   * and no equipment downtime overlaps it.
   */
  const isVenueOpen = (location, s, e) => {
    const loc = (location ?? '').trim().toLowerCase();
    const v = venues.get(loc);
    if (!v) return true; // not a tracked venue → no venue constraint
    if (!containedInAny(v.avail, s, e)) return false;
    if (overlapsAny(v.downtime, s, e)) return false;
    return true;
  };

  const providerFree = (entry, s, e) =>
    containedInAny(entry.avail, s, e) &&
    !overlapsAny(entry.downtime, s, e) &&
    !overlapsAny(entry.booked, s, e);

  /**
   * Resolve a facilitator for [s,e). A pinned `resourceId` checks that one;
   * otherwise any provider of `role` is tried (role-based substitution).
   * Returns the chosen provider entry, or null if none is free.
   */
  const findProvider = (spec, s, e, needRemote) => {
    if (spec.resourceId) {
      const entry = providerById.get(spec.resourceId);
      if (!entry) return null;
      if (needRemote && !entry.meta.remoteOk) return null;
      return providerFree(entry, s, e) ? entry : null;
    }
    const candidates = providersByRole.get(spec.role) ?? [];
    for (const entry of candidates) {
      if (needRemote && !entry.meta.remoteOk) continue;
      if (providerFree(entry, s, e)) return entry;
    }
    return null;
  };

  const bookProvider = (id, s, e) => {
    const p = providerById.get(id);
    if (p) bucketByDay(p.booked, { start: s, end: e });
  };

  return {
    isMemberFree,
    isMemberBooked,
    bookMember,
    eventCountOn,
    eventTooClose,
    bookEvent,
    travelAt,
    isVenueOpen,
    findProvider,
    bookProvider,
  };
}
