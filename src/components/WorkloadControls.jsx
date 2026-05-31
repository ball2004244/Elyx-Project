/**
 * @file Live workload controls. Two sliders re-run the scheduler, letting the
 * user watch the constraint solver respond: tightening the daily cap or the
 * inter-event buffer visibly shifts placements and skips.
 *
 * UX: the slider THUMB tracks instantly (local state) while the expensive
 * full-horizon re-solve is debounced, so dragging stays smooth instead of
 * re-scheduling on every pixel.
 */

import { useEffect, useRef, useState } from 'react';
import { Sliders } from '@phosphor-icons/react/dist/csr/Sliders';
import { MAX_EVENTS_RANGE, EVENT_BUFFER_RANGE } from '../scheduler/config.js';

const DEBOUNCE_MS = 200;

function Slider({ label, value, min, max, step = 1, suffix, onInput }) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
      <span className="w-28 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onInput(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-teal-600 dark:accent-teal-400"
      />
      <span className="w-14 shrink-0 text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
        {suffix}
      </span>
    </label>
  );
}

/**
 * @param {{
 *   maxEventsPerDay: number,
 *   eventBufferMin: number,
 *   onChange: (next: { maxEventsPerDay: number, eventBufferMin: number }) => void,
 * }} props
 */
export function WorkloadControls({
  maxEventsPerDay,
  eventBufferMin,
  onChange,
}) {
  // Local display state tracks the thumb instantly; the committed re-solve is
  // debounced via the timer below. Initialized from props; thereafter the
  // slider drives both the draft and (debounced) the parent, so they stay in
  // sync without a syncing effect.
  const [draft, setDraft] = useState({ maxEventsPerDay, eventBufferMin });
  const timer = useRef(null);

  // Clean up any pending timer on unmount.
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (next) => {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), DEBOUNCE_MS);
  };

  return (
    <section className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <Sliders size={16} className="text-teal-600 dark:text-teal-400" />
        Scheduling policy
      </h2>
      <div className="flex flex-col gap-2.5">
        <Slider
          label="Max events / day"
          value={draft.maxEventsPerDay}
          min={MAX_EVENTS_RANGE.min}
          max={MAX_EVENTS_RANGE.max}
          onInput={(v) => commit({ ...draft, maxEventsPerDay: v })}
        />
        <Slider
          label="Gap between events"
          value={draft.eventBufferMin}
          min={EVENT_BUFFER_RANGE.min}
          max={EVENT_BUFFER_RANGE.max}
          step={EVENT_BUFFER_RANGE.step}
          suffix=" min"
          onInput={(v) => commit({ ...draft, eventBufferMin: v })}
        />
      </div>
    </section>
  );
}
