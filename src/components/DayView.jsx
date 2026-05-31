/**
 * @file Single-day event agenda. Shows the day's events (deduped) as a vertical
 * list; routines live in the Daily Routine panel, not here.
 */

import { ActivityBlock } from './ActivityBlock.jsx';
import { bandByDayPart } from '../ui/aggregate.js';
import { dayLabel } from '../ui/encoding.js';

/**
 * @param {{
 *   day: string,
 *   events: object[],
 *   activityById: Map<string, object>,
 *   selectedKey: string | null,
 *   onSelect: (instance: object) => void,
 * }} props
 */
export function DayView({ day, events, activityById, selectedKey, onSelect }) {
  const { weekday } = dayLabel(day);
  const bands = bandByDayPart(events);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {weekday} · {day}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </p>
      </header>
      {events.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-600">
          No events scheduled. See Self-care for the member's daily items.
        </p>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {bands.map((band) => (
            <div key={band.key} className="px-3 py-3">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
                {band.label}
              </p>
              {band.items.length === 0 ? (
                <p className="text-xs italic text-zinc-300 dark:text-zinc-700">
                  Open
                </p>
              ) : (
                <div className="flex flex-col gap-2">
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
          ))}
        </div>
      )}
    </div>
  );
}
