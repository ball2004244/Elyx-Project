/**
 * @file The closed resource bank (decision d): the canonical set of equipment,
 * specialists, and allied-health providers the scheduler may draw from.
 *
 * Single source of truth shared by the action-plan patch, the availability
 * generator, and the reference validator — so roles/ids never drift.
 *
 * Horizon: 2026-06-01 .. 2026-08-31 (inclusive). Datetimes are local ISO-8601.
 *
 * Role-based selection (decision c): activities mostly reference a ROLE; the
 * scheduler picks any available provider of that role. We intentionally include
 * MORE THAN ONE provider for key roles (trainer, physiotherapist) so
 * resource-level substitution is demonstrable when the first is on leave.
 */

export const HORIZON_START = '2026-06-01';
export const HORIZON_END = '2026-08-31';

/** Canonical roles (lowercase) used across activities and providers. */
export const ROLES = {
  TRAINER: 'personal trainer',
  PHYSIO: 'physiotherapist',
  DIETITIAN: 'dietitian',
  NUTRITIONIST: 'nutritionist',
  MASSAGE: 'massage therapist',
  YOGA: 'yoga instructor',
  HEALTH_COACH: 'health coach',
  LONGEVITY_PHYSICIAN: 'longevity physician',
  CARDIOLOGIST: 'cardiologist',
  ENDOCRINOLOGIST: 'endocrinologist',
  SLEEP_PHYSICIAN: 'sleep physician',
  SPORTS_MED: 'sports medicine physician',
};

/**
 * Equipment bank (eq-01..12). `weekly` describes the recurring AVAILABLE
 * pattern; the generator expands it to concrete windows over the horizon.
 * `days`: 0=Sun..6=Sat. Times are "HH:MM".
 */
export const EQUIPMENT = [
  {
    id: 'eq-01',
    name: 'Treadmill',
    location: 'Elyx gym',
    weekly: { days: [1, 2, 3, 4, 5, 6, 0], open: '06:00', close: '21:00' },
  },
  {
    id: 'eq-02',
    name: 'Indoor Bike',
    location: 'Elyx gym',
    weekly: { days: [1, 2, 3, 4, 5, 6, 0], open: '06:00', close: '21:00' },
  },
  {
    id: 'eq-03',
    name: 'Rowing Ergometer',
    location: 'Elyx gym',
    weekly: { days: [1, 2, 3, 4, 5, 6, 0], open: '06:00', close: '21:00' },
  },
  {
    id: 'eq-04',
    name: 'Barbell & Rack',
    location: 'Elyx gym',
    weekly: { days: [1, 2, 3, 4, 5, 6], open: '06:00', close: '21:00' },
  },
  {
    id: 'eq-05',
    name: 'Adjustable Dumbbells',
    location: 'home',
    weekly: { days: [1, 2, 3, 4, 5, 6, 0], open: '05:00', close: '23:00' },
  },
  {
    id: 'eq-06',
    name: 'Kettlebell Set',
    location: 'home',
    weekly: { days: [1, 2, 3, 4, 5, 6, 0], open: '05:00', close: '23:00' },
  },
  {
    id: 'eq-07',
    name: 'Infrared Sauna',
    location: 'Elyx clinic',
    weekly: { days: [1, 2, 3, 4, 5, 6], open: '07:00', close: '20:00' },
  },
  {
    id: 'eq-08',
    name: 'Ice Bath / Plunge',
    location: 'Elyx clinic',
    weekly: { days: [1, 2, 3, 4, 5, 6], open: '07:00', close: '20:00' },
  },
  {
    id: 'eq-09',
    name: 'Yoga Mat',
    location: 'home',
    weekly: { days: [1, 2, 3, 4, 5, 6, 0], open: '05:00', close: '23:00' },
  },
  {
    id: 'eq-10',
    name: 'HR Chest Strap',
    location: 'home',
    weekly: { days: [1, 2, 3, 4, 5, 6, 0], open: '05:00', close: '23:00' },
  },
  {
    id: 'eq-11',
    name: 'Massage Gun',
    location: 'home',
    weekly: { days: [1, 2, 3, 4, 5, 6, 0], open: '05:00', close: '23:00' },
  },
  {
    id: 'eq-12',
    name: 'Resistance Bands',
    location: 'home',
    weekly: { days: [1, 2, 3, 4, 5, 6, 0], open: '05:00', close: '23:00' },
  },
];

/** Specialist bank (sp-01..05). */
export const SPECIALISTS = [
  {
    id: 'sp-01',
    name: 'Dr. Aisha Rahman',
    role: ROLES.LONGEVITY_PHYSICIAN,
    remoteOk: true,
    weekly: { days: [2, 4], open: '09:00', close: '17:00' },
  },
  {
    id: 'sp-02',
    name: 'Dr. Edmund Lai',
    role: ROLES.CARDIOLOGIST,
    remoteOk: false,
    weekly: { days: [3], open: '09:00', close: '15:00' },
  },
  {
    id: 'sp-03',
    name: 'Dr. Priya Nair',
    role: ROLES.ENDOCRINOLOGIST,
    remoteOk: true,
    weekly: { days: [1, 4], open: '10:00', close: '16:00' },
  },
  {
    id: 'sp-04',
    name: 'Dr. Marcus Wong',
    role: ROLES.SLEEP_PHYSICIAN,
    remoteOk: true,
    weekly: { days: [5], open: '09:00', close: '14:00' },
  },
  {
    id: 'sp-05',
    name: 'Dr. Sofia Alvarez',
    role: ROLES.SPORTS_MED,
    remoteOk: false,
    weekly: { days: [2, 5], open: '08:00', close: '13:00' },
  },
];

/**
 * Allied-health bank (ah-01..09). Two trainers (ah-01, ah-08) and two
 * physiotherapists (ah-02, ah-09) enable role-based substitution.
 */
export const ALLIED_HEALTH = [
  {
    id: 'ah-01',
    name: 'Jake Sullivan',
    role: ROLES.TRAINER,
    remoteOk: true,
    weekly: { days: [1, 3, 5], open: '07:00', close: '12:00' },
  },
  {
    id: 'ah-02',
    name: 'Hannah Goh',
    role: ROLES.PHYSIO,
    remoteOk: true,
    weekly: { days: [2, 4], open: '09:00', close: '15:00' },
  },
  {
    id: 'ah-03',
    name: 'Lena Fischer',
    role: ROLES.DIETITIAN,
    remoteOk: true,
    weekly: { days: [1, 3], open: '10:00', close: '18:00' },
  },
  {
    id: 'ah-04',
    name: 'Tomás Reyes',
    role: ROLES.MASSAGE,
    remoteOk: false,
    weekly: { days: [4, 6], open: '10:00', close: '19:00' },
  },
  {
    id: 'ah-05',
    name: 'Anjali Menon',
    role: ROLES.YOGA,
    remoteOk: true,
    weekly: { days: [1, 3, 5, 6], open: '07:00', close: '11:00' },
  },
  {
    id: 'ah-06',
    name: 'Chris Tan',
    role: ROLES.HEALTH_COACH,
    remoteOk: true,
    weekly: { days: [1, 2, 3, 4, 5], open: '09:00', close: '18:00' },
  },
  {
    id: 'ah-07',
    name: 'Maria Santos',
    role: ROLES.NUTRITIONIST,
    remoteOk: true,
    weekly: { days: [2, 4], open: '11:00', close: '17:00' },
  },
  {
    id: 'ah-08',
    name: 'Daniel Kim',
    role: ROLES.TRAINER,
    remoteOk: true,
    weekly: { days: [2, 4, 6], open: '08:00', close: '13:00' },
  },
  {
    id: 'ah-09',
    name: 'Grace Lim',
    role: ROLES.PHYSIO,
    remoteOk: true,
    weekly: { days: [1, 5], open: '13:00', close: '18:00' },
  },
];

/** Map a free-text role (any casing/variant) to a canonical ROLES value. */
export function canonicalizeRole(role) {
  if (!role) return '';
  const r = role.trim().toLowerCase();
  const aliases = {
    'self-directed': 'self',
    member: 'self',
    'self-administer': 'self',
    trainer: ROLES.TRAINER,
    'personal trainer': ROLES.TRAINER,
    physiotherapist: ROLES.PHYSIO,
    physio: ROLES.PHYSIO,
    dietitian: ROLES.DIETITIAN,
    nutritionist: ROLES.NUTRITIONIST,
    'massage therapist': ROLES.MASSAGE,
    'yoga instructor': ROLES.YOGA,
    'health coach': ROLES.HEALTH_COACH,
    'longevity physician': ROLES.LONGEVITY_PHYSICIAN,
    cardiologist: ROLES.CARDIOLOGIST,
    endocrinologist: ROLES.ENDOCRINOLOGIST,
    'sleep physician': ROLES.SLEEP_PHYSICIAN,
    'sports medicine physician': ROLES.SPORTS_MED,
  };
  return aliases[r] ?? r;
}
