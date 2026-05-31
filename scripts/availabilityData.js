/**
 * @file Deterministic generator for the constraint AVAILABILITY dataset
 * (assignment deliverable #2: 3 months of availability for the 5 constraint
 * nodes). Pure + seeded, so output is reproducible and testable.
 *
 * Why deterministic rather than LLM-sampled: producing hundreds of precise,
 * non-overlapping ISO windows is exactly what an LLM does unreliably, and what
 * code does perfectly. The realism (downtime, incidents, travel) is injected
 * deliberately so the scheduler's substitution/backup/skip paths are exercised.
 *
 * Produces an object matching the Constraints schema, PLUS resource metadata,
 * ready to be flattened to CSV.
 */

import {
  HORIZON_START,
  HORIZON_END,
  EQUIPMENT,
  SPECIALISTS,
  ALLIED_HEALTH,
} from './resourceBank.js';

/* ----------------------------- date helpers ------------------------------ */

const pad = (n) => String(n).padStart(2, '0');
/** Build a local ISO datetime from a Date's Y/M/D and an "HH:MM" string. */
function iso(date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  return `${y}-${mo}-${d}T${pad(h)}:${pad(m)}:00`;
}
function eachDay(startStr, endStr) {
  const out = [];
  const d = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  while (d <= end) {
    out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/* --------------------------- window expansion ---------------------------- */

/** Expand a {days, open, close} weekly pattern into concrete daily windows. */
function expandWeekly(weekly) {
  const windows = [];
  for (const day of eachDay(HORIZON_START, HORIZON_END)) {
    if (weekly.days.includes(day.getUTCDay())) {
      windows.push({
        start: iso(day, weekly.open),
        end: iso(day, weekly.close),
      });
    }
  }
  return windows;
}

/* ------------------------- deterministic downtime ------------------------ */

/**
 * Curated, reasoned downtime per resource id (decision b). Carved as explicit
 * blocked windows; the scheduler subtracts these from availability.
 */
const DOWNTIME = {
  // Equipment maintenance.
  'eq-01': [
    {
      start: '2026-06-23T00:00:00',
      end: '2026-06-25T23:59:00',
      reason: 'Treadmill belt maintenance',
    },
  ],
  'eq-07': [
    {
      start: '2026-07-06T00:00:00',
      end: '2026-07-08T23:59:00',
      reason: 'Sauna heating element service',
    },
  ],
  'eq-08': [
    {
      start: '2026-08-10T00:00:00',
      end: '2026-08-12T23:59:00',
      reason: 'Ice bath chiller repair',
    },
  ],
  // Provider leave / incidents.
  'ah-01': [
    {
      start: '2026-07-13T00:00:00',
      end: '2026-07-19T23:59:00',
      reason: 'Trainer on annual leave',
    },
  ],
  'ah-02': [
    {
      start: '2026-06-25T00:00:00',
      end: '2026-06-25T23:59:00',
      reason: 'Physiotherapist sick day',
    },
  ],
  'ah-04': [
    {
      start: '2026-08-01T00:00:00',
      end: '2026-08-07T23:59:00',
      reason: 'Massage therapist on leave',
    },
  ],
  'sp-02': [
    {
      start: '2026-07-15T00:00:00',
      end: '2026-07-15T23:59:00',
      reason: 'Cardiology clinic cancelled (conference)',
    },
  ],
  'sp-05': [
    {
      start: '2026-06-30T00:00:00',
      end: '2026-07-03T23:59:00',
      reason: 'Sports medicine physician at symposium',
    },
  ],
};

/* ------------------------------ member data ------------------------------ */

/** Recurring member commitments (BLOCKED) expanded over the horizon. */
function buildClientSchedule() {
  const entries = [];
  for (const day of eachDay(HORIZON_START, HORIZON_END)) {
    const dow = day.getUTCDay();
    // Weekday work blocks.
    if (dow >= 1 && dow <= 5) {
      entries.push({
        start: iso(day, '09:30'),
        end: iso(day, '12:30'),
        label: 'Work — morning focus block',
        kind: 'commitment',
      });
      entries.push({
        start: iso(day, '14:00'),
        end: iso(day, '17:00'),
        label: 'Work — meetings',
        kind: 'commitment',
      });
    }
    // Friday family dinner.
    if (dow === 5) {
      entries.push({
        start: iso(day, '19:00'),
        end: iso(day, '21:30'),
        label: 'Family dinner',
        kind: 'commitment',
      });
    }
    // Sunday family time.
    if (dow === 0) {
      entries.push({
        start: iso(day, '10:00'),
        end: iso(day, '15:00'),
        label: 'Family time',
        kind: 'commitment',
      });
    }
  }
  // Abrupt incidents (unexpected, kind=incident).
  entries.push({
    start: '2026-06-18T08:00:00',
    end: '2026-06-18T18:00:00',
    label: 'Unwell — rest day',
    kind: 'incident',
  });
  entries.push({
    start: '2026-07-09T13:00:00',
    end: '2026-07-09T20:00:00',
    label: 'Urgent business matter',
    kind: 'incident',
  });
  entries.push({
    start: '2026-08-20T08:00:00',
    end: '2026-08-20T19:00:00',
    label: 'Family emergency',
    kind: 'incident',
  });
  return entries;
}

/** Travel trips (BLOCKED, location changes). On-site/in-person unusable. */
function buildTravel() {
  return [
    {
      start: '2026-06-14T00:00:00',
      end: '2026-06-18T23:59:00',
      destination: 'Tokyo (business)',
      location: 'Tokyo',
    },
    {
      start: '2026-07-20T00:00:00',
      end: '2026-07-26T23:59:00',
      destination: 'London (business)',
      location: 'London',
    },
    {
      start: '2026-08-14T00:00:00',
      end: '2026-08-19T23:59:00',
      destination: 'Bali (holiday)',
      location: 'Bali',
    },
  ];
}

/* -------------------------------- assemble ------------------------------- */

export function generateConstraints() {
  const equipment = EQUIPMENT.map((e) => ({
    id: e.id,
    name: e.name,
    location: e.location,
    availability: expandWeekly(e.weekly),
    downtime: DOWNTIME[e.id] ?? [],
  }));
  const specialists = SPECIALISTS.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    remoteOk: s.remoteOk,
    availability: expandWeekly(s.weekly),
    downtime: DOWNTIME[s.id] ?? [],
  }));
  const alliedHealth = ALLIED_HEALTH.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    remoteOk: a.remoteOk,
    availability: expandWeekly(a.weekly),
    downtime: DOWNTIME[a.id] ?? [],
  }));
  return {
    clientSchedule: buildClientSchedule(),
    travel: buildTravel(),
    equipment,
    specialists,
    alliedHealth,
  };
}
