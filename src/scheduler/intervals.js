/**
 * @file Time-interval primitives for the scheduler.
 *
 * All datetimes are local ISO-8601 without timezone (e.g. "2026-06-01T09:00").
 * We parse them as if UTC so arithmetic is stable and tz-free; this is safe
 * because every datetime in the dataset uses the same convention.
 *
 * Windows are half-open [start, end): touching edges do NOT overlap.
 */

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

/** Parse a local ISO datetime to epoch ms (treated as UTC). */
export function toMs(iso) {
  return new Date(`${iso}Z`).getTime();
}

const pad = (n) => String(n).padStart(2, '0');

/** Format epoch ms back to a local ISO datetime "YYYY-MM-DDTHH:MM:SS". */
export function toIso(ms) {
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return `${date}T${time}`;
}

/** "YYYY-MM-DD" day key for an ISO datetime. */
export function dayKey(iso) {
  return iso.slice(0, 10);
}

/** Build an ISO datetime from a "YYYY-MM-DD" day and minutes-from-midnight. */
export function isoAtMinutes(day, minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${day}T${pad(h)}:${pad(m)}:00`;
}

/** Add minutes to an ISO datetime, returning a new ISO datetime. */
export function addMinutes(iso, minutes) {
  return toIso(toMs(iso) + minutes * MS_PER_MIN);
}

/**
 * Half-open overlap test for [aStart, aEnd) and [bStart, bEnd) (all ISO).
 * @returns {boolean}
 */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return toMs(aStart) < toMs(bEnd) && toMs(bStart) < toMs(aEnd);
}

/** True if [innerStart, innerEnd) fits entirely within [outerStart, outerEnd). */
export function contains(outerStart, outerEnd, innerStart, innerEnd) {
  return (
    toMs(outerStart) <= toMs(innerStart) && toMs(innerEnd) <= toMs(outerEnd)
  );
}

/**
 * List every "YYYY-MM-DD" day from startDay to endDay inclusive.
 * @param {string} startDay "YYYY-MM-DD"
 * @param {string} endDay "YYYY-MM-DD"
 * @returns {string[]}
 */
export function eachDay(startDay, endDay) {
  const out = [];
  let ms = toMs(`${startDay}T00:00:00`);
  const end = toMs(`${endDay}T00:00:00`);
  while (ms <= end) {
    out.push(dayKey(toIso(ms)));
    ms += MS_PER_DAY;
  }
  return out;
}

/** Day-of-week 0=Sun..6=Sat for a "YYYY-MM-DD" day. */
export function weekday(day) {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}
