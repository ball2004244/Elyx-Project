/**
 * @file Single source of truth for the calendar's visual encoding.
 *
 * Color Consistency Lock (taste-skill 4.2): activity-type hues are fixed here
 * and used ONLY inside activity blocks. The app's one accent (teal) lives in
 * Tailwind classes for "today"/primary actions and is never mixed with these.
 * Placement `kind` is shown by treatment (solid / dashed / muted), not new hues.
 */

/**
 * Per-activity-type encoding: a Tailwind class set for the block, plus a
 * human label. Hues are distinct but equally muted so no type screams.
 */
export const TYPE_STYLE = {
  fitness: {
    label: 'Fitness',
    text: 'text-sky-600 dark:text-sky-400',
    block:
      'bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-500/10 ' +
      'dark:text-sky-200 dark:ring-sky-500/30',
  },
  food: {
    label: 'Food',
    text: 'text-emerald-600 dark:text-emerald-400',
    block:
      'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 ' +
      'dark:text-emerald-200 dark:ring-emerald-500/30',
  },
  medication: {
    label: 'Medication',
    text: 'text-rose-600 dark:text-rose-400',
    block:
      'bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-500/10 ' +
      'dark:text-rose-200 dark:ring-rose-500/30',
  },
  therapy: {
    label: 'Therapy',
    text: 'text-violet-600 dark:text-violet-400',
    block:
      'bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-500/10 ' +
      'dark:text-violet-200 dark:ring-violet-500/30',
  },
  consultation: {
    label: 'Consultation',
    text: 'text-amber-600 dark:text-amber-400',
    block:
      'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/10 ' +
      'dark:text-amber-200 dark:ring-amber-500/30',
  },
};

export const TYPE_ORDER = [
  'fitness',
  'food',
  'medication',
  'therapy',
  'consultation',
];

/** Short labels for the placement kind badge. */
export const KIND_LABEL = {
  primary: 'Scheduled',
  backup: 'Substituted',
  skipped: 'Skipped',
};

/** Format an ISO datetime to "HH:MM" (24h). */
export function clock(iso) {
  return iso.slice(11, 16);
}

/**
 * Day-part band for an ISO datetime: morning (< 12:00), afternoon (12:00-16:59),
 * evening (>= 17:00). Used to band agenda columns so daily rhythm + free time
 * are visible without a full hour-grid.
 */
export const DAY_PARTS = [
  { key: 'morning', label: 'Morning', maxHour: 12 },
  { key: 'afternoon', label: 'Afternoon', maxHour: 17 },
  { key: 'evening', label: 'Evening', maxHour: 24 },
];

export function dayPart(iso) {
  const hour = Number(iso.slice(11, 13));
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Format a "YYYY-MM-DD" day to a short weekday + day-of-month label. */
export function dayLabel(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return { weekday: wd, dom: d.getUTCDate() };
}

/** Month + year header for a day, e.g. "June 2026". */
export function monthLabel(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const month = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][d.getUTCMonth()];
  return `${month} ${d.getUTCFullYear()}`;
}

const MON = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Short date like "Jun 1". */
function shortDate(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Header label for the current range, per view mode.
 * @param {string} mode 'day' | 'week' | 'month'
 * @param {string} startDay
 * @param {string} endDay
 */
export function rangeLabel(mode, startDay, endDay) {
  if (mode === 'day') {
    const d = new Date(`${startDay}T00:00:00Z`);
    return `${shortDate(startDay)}, ${d.getUTCFullYear()}`;
  }
  if (mode === 'month') return monthLabel(startDay);
  return `${shortDate(startDay)} - ${shortDate(endDay)}`;
}
