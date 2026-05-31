/**
 * @file Month overview: a calendar grid where each day cell shows its event
 * count and a type-colored dot row. Clicking a day drills into the Day view.
 */

import { eachDay, weekday } from '../scheduler/intervals.js';
import { TYPE_STYLE } from '../ui/encoding.js';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday-first column index (0..6) for a day. */
const colOf = (day) => (weekday(day) + 6) % 7;

/**
 * @param {{
 *   monthStart: string,
 *   monthEnd: string,
 *   eventsByDay: Map<string, object[]>,
 *   today: string,
 *   onPickDay: (day: string) => void,
 * }} props
 */
export function MonthGrid({
  monthStart,
  monthEnd,
  eventsByDay,
  today,
  onPickDay,
}) {
  const days = eachDay(monthStart, monthEnd);
  const lead = colOf(days[0]);

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-px">
        {WD.map((d) => (
          <div
            key={d}
            className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-800">
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`lead-${i}`} className="bg-zinc-50 dark:bg-zinc-900" />
        ))}
        {days.map((day) => {
          const events = eventsByDay.get(day) ?? [];
          const isToday = day === today;
          const dotTypes = [...new Set(events.map((e) => e._type))].slice(0, 5);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              className="flex min-h-[5.5rem] flex-col bg-white p-2 text-left transition hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            >
              <span
                className={[
                  'font-mono text-xs tabular-nums',
                  isToday
                    ? 'flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white dark:bg-teal-500'
                    : 'text-zinc-500 dark:text-zinc-400',
                ].join(' ')}
              >
                {day.slice(8)}
              </span>
              {events.length > 0 ? (
                <span className="mt-auto flex items-center gap-1">
                  <span className="flex gap-0.5">
                    {dotTypes.map((t) => (
                      <span
                        key={t}
                        className={`h-1.5 w-1.5 rounded-full ${TYPE_STYLE[t]?.dot ?? 'bg-zinc-400'}`}
                      />
                    ))}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {events.length}
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
