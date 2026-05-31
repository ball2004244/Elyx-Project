/**
 * @file Elyx Resource Allocator — calendar app root.
 * Loads data + runs the scheduler once, splits events (calendar) from routines
 * (Daily Routine), and renders Day / Week / Month views with a grouped skipped
 * panel.
 */

import { useMemo, useState } from 'react';
import { loadData } from './lib/loadData.js';
import { schedule } from './scheduler/schedule.js';
import { groupByDay, weekRange, monthBounds } from './scheduler/index.js';
import { MAX_EVENTS_PER_DAY, EVENT_BUFFER_MIN } from './scheduler/config.js';
import { toMs, dayKey, eachDay } from './scheduler/intervals.js';
import {
  splitPlan,
  buildDailyProtocol,
  groupSkippedByReason,
  dedupeDay,
  tagEventsForMonth,
} from './ui/aggregate.js';
import { rangeLabel } from './ui/encoding.js';
import { Topbar } from './components/Topbar.jsx';
import { SummaryStrip } from './components/SummaryStrip.jsx';
import { WeekGrid } from './components/WeekGrid.jsx';
import { DayView } from './components/DayView.jsx';
import { MonthGrid } from './components/MonthGrid.jsx';
import { DailyProtocol } from './components/DailyProtocol.jsx';
import { WorkloadControls } from './components/WorkloadControls.jsx';
import { SidePanel } from './components/SidePanel.jsx';
import { Legend } from './components/Legend.jsx';
import { useTheme } from './ui/useTheme.js';

const DAY_MS = 86_400_000;
const MEMBER_NAME = 'Member · Healthspan Program';

/** Clamp a day string into [lo, hi]. */
const clamp = (day, lo, hi) => (day < lo ? lo : day > hi ? hi : day);

export default function App() {
  const [theme, toggleTheme] = useTheme();
  // Parse the CSVs once; the scheduler re-runs when the policy changes.
  const data = useMemo(() => loadData(), []);
  const { horizon, activityById } = data;

  const [policy, setPolicy] = useState({
    maxEventsPerDay: MAX_EVENTS_PER_DAY,
    eventBufferMin: EVENT_BUFFER_MIN,
  });
  const [mode, setMode] = useState('week');
  const [anchor, setAnchor] = useState(horizon.startDay);
  const [selected, setSelected] = useState(null);

  // Re-run the scheduler whenever the workload policy changes (<200ms).
  const plan = useMemo(
    () => schedule(data.activities, data.constraints, horizon, policy),
    [data, horizon, policy],
  );

  // Static view models (computed from the current plan).
  const { events } = useMemo(
    () => splitPlan(plan, activityById),
    [plan, activityById],
  );
  const protocol = useMemo(
    () =>
      buildDailyProtocol(splitPlan(plan, activityById).routines, activityById),
    [plan, activityById],
  );
  const allSkipped = useMemo(
    () => plan.filter((i) => i.kind === 'skipped'),
    [plan],
  );
  const eventsByDayAll = useMemo(() => groupByDay(events), [events]);

  // Current visible range per mode.
  const range = useMemo(() => {
    if (mode === 'day') return { startDay: anchor, endDay: anchor };
    if (mode === 'month') return monthBounds(anchor);
    return weekRange(anchor);
  }, [mode, anchor]);

  // Events scoped to the visible range, grouped by day.
  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const day of eachDay(range.startDay, range.endDay)) {
      const items = eventsByDayAll.get(day);
      if (items) map.set(day, items);
    }
    return map;
  }, [eventsByDayAll, range]);

  // Skipped instances scoped to the visible range (by their intended day),
  // grouped by reason.
  const skippedByReason = useMemo(() => {
    const inRange = allSkipped.filter(
      (i) => i.day && i.day >= range.startDay && i.day <= range.endDay,
    );
    return groupSkippedByReason(inRange, activityById);
  }, [allSkipped, range, activityById]);

  // Summary counts for the visible range.
  const summary = useMemo(() => {
    let placed = 0;
    let backup = 0;
    for (const items of eventsByDay.values()) {
      for (const e of items) e.kind === 'backup' ? backup++ : placed++;
    }
    const skipped = skippedByReason.reduce((n, g) => n + g.count, 0);
    return { placed, backup, skipped };
  }, [eventsByDay, skippedByReason]);

  const step = mode === 'day' ? 1 : mode === 'month' ? 0 : 7;
  const canPrev = anchor > horizon.startDay;
  const canNext = range.endDay < horizon.endDay;

  const shift = (dir) => {
    let next;
    if (mode === 'month') {
      const b = monthBounds(anchor);
      next =
        dir < 0
          ? dayKey(
              new Date(toMs(`${b.startDay}T00:00:00`) - DAY_MS).toISOString(),
            )
          : dayKey(
              new Date(toMs(`${b.endDay}T00:00:00`) + DAY_MS).toISOString(),
            );
    } else {
      next = dayKey(
        new Date(
          toMs(`${anchor}T00:00:00`) + dir * step * DAY_MS,
        ).toISOString(),
      );
    }
    setAnchor(clamp(next, horizon.startDay, horizon.endDay));
    setSelected(null);
  };

  const pickDay = (day) => {
    setAnchor(clamp(day, horizon.startDay, horizon.endDay));
    setMode('day');
    setSelected(null);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <Topbar
        memberName={MEMBER_NAME}
        rangeLabel={rangeLabel(mode, range.startDay, range.endDay)}
        mode={mode}
        onMode={(m) => {
          setMode(m);
          setSelected(null);
        }}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onStart={() => {
          setAnchor(horizon.startDay);
          setSelected(null);
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <SummaryStrip
            placed={summary.placed}
            backup={summary.backup}
            skipped={summary.skipped}
          />
          <Legend />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="flex flex-col gap-5">
            {mode === 'week' ? (
              <WeekGrid
                weekStart={range.startDay}
                weekEnd={range.endDay}
                eventsByDay={eventsByDay}
                activityById={activityById}
                today={horizon.startDay}
                selectedKey={selected?._key ?? null}
                onSelect={setSelected}
              />
            ) : null}

            {mode === 'day' ? (
              <DayView
                day={range.startDay}
                events={dedupeDay(eventsByDay.get(range.startDay) ?? [])}
                activityById={activityById}
                selectedKey={selected?._key ?? null}
                onSelect={setSelected}
              />
            ) : null}

            {mode === 'month' ? (
              <MonthGrid
                monthStart={range.startDay}
                monthEnd={range.endDay}
                eventsByDay={tagEventsForMonth(eventsByDay, activityById)}
                today={horizon.startDay}
                onPickDay={pickDay}
              />
            ) : null}

            <DailyProtocol protocol={protocol} />
          </div>

          <div className="flex flex-col gap-5">
            <WorkloadControls
              maxEventsPerDay={policy.maxEventsPerDay}
              eventBufferMin={policy.eventBufferMin}
              onChange={(next) => {
                setPolicy(next);
                setSelected(null);
              }}
            />
            <SidePanel
              selected={selected}
              activityById={activityById}
              skippedByReason={skippedByReason}
              onClear={() => setSelected(null)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
