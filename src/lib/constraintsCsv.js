/**
 * @file Mapping between the Constraints bundle and a NORMALIZED set of CSVs.
 *
 * Constraints contain resources (equipment/specialists/allied health) each with
 * many availability + downtime windows, plus member client-schedule and travel
 * blocks. Stuffing everything into one wide CSV would duplicate resource
 * metadata on every window row. Instead we use a small normalized schema (like
 * DB tables), which is DRY and easy to read:
 *
 *   resources.csv        one row per resource (kind, id, name, role,
 *                        location, remoteOk)
 *   resource_windows.csv one row per window (resourceId, windowType, start,
 *                        end, reason)
 *   client_schedule.csv  one row per member commitment/incident
 *   travel.csv           one row per trip
 *
 * `toConstraintCsvs()` serializes; `fromConstraintCsvs()` rebuilds + validates
 * via the Constraints Zod schema, keeping the round-trip symmetric.
 */

import { Constraints } from './schemas.js';
import { toCsv, parseCsv } from './csv.js';

export const RESOURCE_COLUMNS = [
  'kind',
  'id',
  'name',
  'role',
  'location',
  'remoteOk',
];
export const RESOURCE_WINDOW_COLUMNS = [
  'resourceId',
  'windowType',
  'start',
  'end',
  'reason',
];
export const CLIENT_SCHEDULE_COLUMNS = ['start', 'end', 'label', 'kind'];
export const TRAVEL_COLUMNS = ['start', 'end', 'destination', 'location'];

export const CONSTRAINT_FILES = {
  resources: 'resources.csv',
  resourceWindows: 'resource_windows.csv',
  clientSchedule: 'client_schedule.csv',
  travel: 'travel.csv',
};

/** @param {import('./schemas.js').Constraints} c */
export function toConstraintCsvs(c) {
  const resourceRows = [];
  const windowRows = [];

  const addResource = (kind, r) => {
    resourceRows.push({
      kind,
      id: r.id,
      name: r.name,
      role: r.role ?? '',
      location: r.location ?? '',
      remoteOk: r.remoteOk == null ? '' : String(r.remoteOk),
    });
    for (const w of r.availability ?? []) {
      windowRows.push({
        resourceId: r.id,
        windowType: 'available',
        start: w.start,
        end: w.end,
        reason: '',
      });
    }
    for (const w of r.downtime ?? []) {
      windowRows.push({
        resourceId: r.id,
        windowType: 'downtime',
        start: w.start,
        end: w.end,
        reason: w.reason ?? '',
      });
    }
  };

  c.equipment.forEach((e) => addResource('equipment', e));
  c.specialists.forEach((s) => addResource('specialist', s));
  c.alliedHealth.forEach((a) => addResource('alliedHealth', a));

  const clientRows = c.clientSchedule.map((e) => ({
    start: e.start,
    end: e.end,
    label: e.label ?? '',
    kind: e.kind ?? 'commitment',
  }));
  const travelRows = c.travel.map((t) => ({
    start: t.start,
    end: t.end,
    destination: t.destination,
    location: t.location ?? '',
  }));

  return {
    resources: toCsv(resourceRows, RESOURCE_COLUMNS),
    resourceWindows: toCsv(windowRows, RESOURCE_WINDOW_COLUMNS),
    clientSchedule: toCsv(clientRows, CLIENT_SCHEDULE_COLUMNS),
    travel: toCsv(travelRows, TRAVEL_COLUMNS),
  };
}

/**
 * Rebuild a Constraints object from the four CSV strings, then Zod-validate.
 * @param {{resources:string, resourceWindows:string,
 *   clientSchedule:string, travel:string}} csvs
 * @returns {import('./schemas.js').Constraints}
 */
export function fromConstraintCsvs(csvs) {
  const resources = parseCsv(csvs.resources);
  const windows = parseCsv(csvs.resourceWindows);
  const clientRows = parseCsv(csvs.clientSchedule);
  const travelRows = parseCsv(csvs.travel);

  // Group windows by resourceId.
  const avail = new Map();
  const down = new Map();
  for (const w of windows) {
    const target = w.windowType === 'downtime' ? down : avail;
    if (!target.has(w.resourceId)) target.set(w.resourceId, []);
    if (w.windowType === 'downtime') {
      target
        .get(w.resourceId)
        .push({ start: w.start, end: w.end, reason: w.reason ?? '' });
    } else {
      target.get(w.resourceId).push({ start: w.start, end: w.end });
    }
  }

  const equipment = [];
  const specialists = [];
  const alliedHealth = [];
  for (const r of resources) {
    const base = {
      id: r.id,
      name: r.name,
      availability: avail.get(r.id) ?? [],
      downtime: down.get(r.id) ?? [],
    };
    if (r.kind === 'equipment') {
      equipment.push({ ...base, location: r.location ?? '' });
    } else if (r.kind === 'specialist') {
      specialists.push({
        ...base,
        role: r.role,
        remoteOk: r.remoteOk === 'true',
      });
    } else if (r.kind === 'alliedHealth') {
      alliedHealth.push({
        ...base,
        role: r.role,
        remoteOk: r.remoteOk === 'true',
      });
    }
  }

  const clientSchedule = clientRows.map((e) => ({
    start: e.start,
    end: e.end,
    label: e.label ?? '',
    kind: e.kind || 'commitment',
  }));
  const travel = travelRows.map((t) => ({
    start: t.start,
    end: t.end,
    destination: t.destination,
    location: t.location ?? '',
  }));

  return Constraints.parse({
    clientSchedule,
    travel,
    equipment,
    specialists,
    alliedHealth,
  });
}
