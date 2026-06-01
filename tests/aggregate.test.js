/**
 * Tests for the presentation aggregation layer (src/ui/aggregate.js).
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import {
  splitPlan,
  dedupeDay,
  bandByDayPart,
  buildDailyProtocol,
  groupSkippedByReason,
  substitutionNote,
  shortLabel,
  cadenceLabel,
  buildBankSummary,
} from '../src/ui/aggregate.js';

const activity = (over) => ({
  id: 'act-1',
  priority: 1,
  activityType: 'fitness',
  frequency: { count: 1, period: 'day' },
  facilitator: { type: 'self' },
  location: 'home',
  details: 'do a thing',
  skipAdjustment: 'do it later',
  ...over,
});

const inst = (over) => ({
  activityId: 'act-1',
  kind: 'primary',
  window: { start: '2026-06-01T07:00:00', end: '2026-06-01T07:30:00' },
  facilitatorId: null,
  equipmentIds: [],
  isRemote: false,
  metrics: [],
  note: '',
  ...over,
});

/* ---- Happy: typical splits + labels ------------------------------------- */

test('happy: splitPlan separates events from routines', () => {
  const byId = new Map([
    [
      'ev',
      activity({
        id: 'ev',
        location: 'Elyx gym',
        frequency: { count: 1, period: 'week' },
      }),
    ],
    ['rt', activity({ id: 'rt', location: 'home' })],
  ]);
  const plan = [inst({ activityId: 'ev' }), inst({ activityId: 'rt' })];
  const { events, routines } = splitPlan(plan, byId);
  expect(events).toHaveLength(1);
  expect(routines).toHaveLength(1);
});

test('happy: cadenceLabel and substitutionNote format human strings', () => {
  expect(cadenceLabel({ count: 3, period: 'week' })).toBe('3x / week');
  // shortLabel takes the first clause and caps length for glanceable rows.
  expect(shortLabel('Brisk outdoor walk, 30-40 min at 100-120 steps/min')).toBe(
    'Brisk outdoor walk',
  );
  // A "Name: guidance" detail (D45) yields the name as the label.
  expect(shortLabel('Dining out: order grilled fish with vegetables')).toBe(
    'Dining out',
  );
  expect(shortLabel('')).toBe('');
  const byId = new Map([
    ['act-99', activity({ id: 'act-99', details: 'Goblet squat' })],
  ]);
  const note = substitutionNote(
    inst({ kind: 'backup', backupId: 'act-99', reason: 'venue-unavailable' }),
    byId,
  );
  expect(note).toContain('Goblet squat');
  expect(note).not.toContain('venue-unavailable'); // raw code hidden
  expect(note.toLowerCase()).toContain('venue');
  // Survives a dedupeDay round-trip (reason/backupId must be carried through).
  const [row] = dedupeDay([
    inst({ kind: 'backup', backupId: 'act-99', reason: 'venue-unavailable' }),
  ]);
  expect(substitutionNote(row, byId)).toContain('Goblet squat');
  // Defensive: a reason-less backup renders without throwing.
  expect(
    substitutionNote(inst({ kind: 'backup', backupId: 'act-99' }), byId),
  ).toBe('Swapped for "Goblet squat"');
});

test('happy: dedupeDay returns one row for a single instance', () => {
  const rows = dedupeDay([inst({})]);
  expect(rows).toHaveLength(1);
  expect(rows[0].count).toBe(1);
});

/* ---- Hard: dedupe + grouping over many instances ------------------------ */

test('hard: dedupeDay collapses repeats into one row with a count', () => {
  const rows = dedupeDay([
    inst({
      window: { start: '2026-06-01T08:00:00', end: '2026-06-01T08:05:00' },
    }),
    inst({
      window: { start: '2026-06-01T06:00:00', end: '2026-06-01T06:05:00' },
    }),
    inst({
      window: { start: '2026-06-01T20:00:00', end: '2026-06-01T20:05:00' },
    }),
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0].count).toBe(3);
  expect(rows[0].window.start).toBe('2026-06-01T06:00:00'); // earliest kept
});

test('hard: buildDailyProtocol groups distinct routines by type', () => {
  const byId = new Map([
    ['m1', activity({ id: 'm1', activityType: 'medication' })],
    ['f1', activity({ id: 'f1', activityType: 'food' })],
    ['f2', activity({ id: 'f2', activityType: 'food' })],
  ]);
  const routines = [
    inst({ activityId: 'm1' }),
    inst({ activityId: 'f1' }),
    inst({ activityId: 'f2' }),
    inst({ activityId: 'f1' }), // duplicate across the horizon → deduped
  ];
  const groups = buildDailyProtocol(routines, byId);
  const food = groups.find((g) => g.type === 'food');
  const med = groups.find((g) => g.type === 'medication');
  expect(food.items).toHaveLength(2);
  expect(med.items).toHaveLength(1);
});

test('hard: groupSkippedByReason groups by reason with counts and items', () => {
  const byId = new Map([['act-1', activity({})]]);
  const plan = [
    inst({ kind: 'skipped', window: null, reason: 'travel-blocked' }),
    inst({ kind: 'skipped', window: null, reason: 'travel-blocked' }),
    inst({ kind: 'skipped', window: null, reason: 'member-busy' }),
  ];
  const groups = groupSkippedByReason(plan, byId);
  const travel = groups.find((g) => g.reason === 'travel-blocked');
  expect(travel.count).toBe(2);
  expect(travel.label).toBe('Member traveling');
  expect(travel.items[0].count).toBe(2);
  expect(groups[0].reason).toBe('travel-blocked'); // most-skipped first
});

/* ---- Edge: empty / skipped-excluded / ordering -------------------------- */

test('edge: splitPlan excludes skipped (windowless) instances', () => {
  const byId = new Map([['act-1', activity({})]]);
  const { events, routines } = splitPlan(
    [inst({ kind: 'skipped', window: null })],
    byId,
  );
  expect(events).toHaveLength(0);
  expect(routines).toHaveLength(0);
});

test('edge: empty inputs produce empty outputs', () => {
  expect(dedupeDay([])).toEqual([]);
  expect(buildDailyProtocol([], new Map())).toEqual([]);
  expect(groupSkippedByReason([], new Map())).toEqual([]);
});

test('edge: dedupeDay sorts the collapsed row, and bandByDayPart splits it', () => {
  const rows = dedupeDay([
    inst({
      activityId: 'x',
      window: { start: '2026-06-01T20:00:00', end: '2026-06-01T20:30:00' },
    }),
    inst({
      activityId: 'x',
      window: { start: '2026-06-01T06:00:00', end: '2026-06-01T06:30:00' },
    }),
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0].window.start).toBe('2026-06-01T06:00:00');

  // Banding: a morning row lands in the morning band, others stay empty.
  const bands = bandByDayPart(rows);
  expect(bands.map((b) => b.key)).toEqual(['morning', 'afternoon', 'evening']);
  expect(bands.find((b) => b.key === 'morning').items).toHaveLength(1);
  expect(bands.find((b) => b.key === 'evening').items).toHaveLength(0);
});

/* ---- buildBankSummary (welcome-page bank context, D47) ------------------ */

const constraints = (over) => ({
  clientSchedule: [],
  travel: [],
  equipment: [
    { id: 'eq-01', name: 'Treadmill', location: 'Elyx gym', availability: [] },
    { id: 'eq-02', name: 'Yoga Mat', location: 'home', availability: [] },
  ],
  specialists: [
    { id: 'sp-01', name: 'Dr. A', role: 'cardiologist', remoteOk: false },
  ],
  alliedHealth: [
    { id: 'ah-01', name: 'T1', role: 'personal trainer', remoteOk: true },
    { id: 'ah-08', name: 'T2', role: 'personal trainer', remoteOk: false },
  ],
  ...over,
});

/* happy */

test('happy: buildBankSummary reports correct totals', () => {
  const s = buildBankSummary(constraints());
  expect(s.totals).toEqual({ equipment: 2, specialists: 1, alliedHealth: 2 });
});

test('happy: buildBankSummary groups equipment by venue', () => {
  const s = buildBankSummary(constraints());
  const gym = s.venues.find((v) => v.location === 'Elyx gym');
  const home = s.venues.find((v) => v.location === 'home');
  expect(gym.items).toEqual(['Treadmill']);
  expect(home.items).toEqual(['Yoga Mat']);
});

test('happy: buildBankSummary groups team by role with counts', () => {
  const s = buildBankSummary(constraints());
  const trainer = s.team.find((r) => r.role === 'personal trainer');
  expect(trainer.count).toBe(2);
});

/* hard */

test('hard: remote flag is true if ANY provider of the role is remote', () => {
  const s = buildBankSummary(constraints());
  const trainer = s.team.find((r) => r.role === 'personal trainer');
  expect(trainer.remote).toBe(true); // ah-01 remote, ah-08 not → true
  const cardio = s.team.find((r) => r.role === 'cardiologist');
  expect(cardio.remote).toBe(false);
});

test('hard: venues and team are sorted alphabetically', () => {
  const s = buildBankSummary(constraints());
  expect(s.venues.map((v) => v.location)).toEqual(['Elyx gym', 'home']);
  expect(s.team.map((r) => r.role)).toEqual([
    'cardiologist',
    'personal trainer',
  ]);
});

test('hard: specialists and allied health are merged into one team list', () => {
  const s = buildBankSummary(constraints());
  // 1 cardiologist role + 1 personal trainer role = 2 distinct roles.
  expect(s.team).toHaveLength(2);
});

/* edge */

test('edge: empty constraints yield empty summary', () => {
  const s = buildBankSummary({
    equipment: [],
    specialists: [],
    alliedHealth: [],
  });
  expect(s.venues).toEqual([]);
  expect(s.team).toEqual([]);
  expect(s.totals).toEqual({ equipment: 0, specialists: 0, alliedHealth: 0 });
});

test('edge: missing constraint arrays default to empty', () => {
  const s = buildBankSummary({});
  expect(s.team).toEqual([]);
  expect(s.totals.equipment).toBe(0);
});

test('edge: equipment without a location is grouped under "other"', () => {
  const s = buildBankSummary({
    equipment: [{ id: 'eq-09', name: 'Band', location: '', availability: [] }],
    specialists: [],
    alliedHealth: [],
  });
  expect(s.venues[0].location).toBe('other');
  expect(s.venues[0].items).toEqual(['Band']);
});
