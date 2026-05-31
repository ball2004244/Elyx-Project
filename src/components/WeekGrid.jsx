/**
 * @file The week view: 7 day columns, each an agenda list of that day's EVENTS
 * (deduped — repeats of the same activity collapse into one row with ×N).
 * Routines are not shown here; they live in the Daily Protocol panel.
 */

import { eachDay } from '../scheduler/intervals.js';
import { ActivityBlock } from './ActivityBlock.jsx';
import { dedupeDay, bandByDayPart } from '../ui/aggregate.js';
import { dayLabel } from '../ui/encoding.js';

/**
 * @param {{
 *   weekStart: string,
 *   weekEnd: string,
 *   eventsByDay: Map<string, object[]>,
 *   activityById: Map<string, import('../lib/schemas.js').Activity>,
 *   today: string,
 *   selectedKey: string | null,
 *   onSelect: (instance: object) => void,
 * }} props
 */
export function WeekGrid({
  weekStart,
  weekEnd,
  eventsByDay,
  activityById,
  today,
  selectedKey,
  onSelect,
}) {
  const days = eachDay(weekStart, weekEnd);

  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-zinc-200 sm:grid-cols-7 dark:bg-zinc-800">
      {days.map((day) => {
        const bands = bandByDayPart(dedupeDay(eventsByDay.get(day) ?? []));
        const dayCount = bands.reduce((n, b) => n + b.items.length, 0);
        const { weekday, dom } = dayLabel(day);
        const isToday = day === today;
        return (
          <section
            key={day}
            className="flex min-h-[12rem] flex-col bg-white dark:bg-zinc-950"
          >
            <header
              className={[
                'sticky top-0 flex items-baseline justify-between px-3 py-2',
                'bg-white/90 backdrop-blur dark:bg-zinc-950/90',
                isToday
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-zinc-500 dark:text-zinc-400',
              ].join(' ')}
            >
              <span className="text-[11px] font-medium uppercase tracking-wide">
                {weekday}
              </span>
              <span
                className={[
                  'font-mono text-sm tabular-nums',
                  isToday
                    ? 'flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-white dark:bg-teal-500'
                    : '',
                ].join(' ')}
              >
                {dom}
              </span>
            </header>

            <div className="flex flex-1 flex-col pb-3">
              {dayCount === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
                  No events
                </p>
              ) : (
                bands.map((band) => (
                  <div key={band.key} className="px-2 pt-2">
                    <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
                      {band.label}
                    </p>
                    {band.items.length === 0 ? (
                      <p className="px-1 pb-1 text-[11px] italic text-zinc-300 dark:text-zinc-700">
                        Open
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {band.items.map((ev) => (
                          <ActivityBlock
                            key={ev._key}
                            instance={ev}
                            activity={activityById.get(ev.activityId)}
                            selected={selectedKey === ev._key}
                            onSelect={() => onSelect(ev)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
