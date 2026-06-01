/**
 * @file First-visit welcome / sampler page (D47). Explains the app in three
 * lines, shows the closed-world resource bank (read-only context), lets the
 * user shape an action-plan request (count + type mix), and offers two paths:
 *   • "Sample new data" → client-side random sampler (D55), then schedule it.
 *   • "Use our sample data" → instant bundled CSV (always-available default, D50).
 *
 * The bank is shown so the user understands what the plan is scheduled against;
 * it is NOT editable (D49) — the cast is fixed, only the prescription varies.
 */

import { useState } from 'react';
import { Sparkle } from '@phosphor-icons/react/dist/csr/Sparkle';
import { FolderOpen } from '@phosphor-icons/react/dist/csr/FolderOpen';
import { Buildings } from '@phosphor-icons/react/dist/csr/Buildings';
import { Users } from '@phosphor-icons/react/dist/csr/Users';
import { VideoCamera } from '@phosphor-icons/react/dist/csr/VideoCamera';
import { Warning } from '@phosphor-icons/react/dist/csr/Warning';
import { Sun } from '@phosphor-icons/react/dist/csr/Sun';
import { Moon } from '@phosphor-icons/react/dist/csr/Moon';
import { TYPE_ORDER, TYPE_STYLE } from '../ui/encoding.js';
import { TypeIcon } from '../ui/icons.jsx';
import { typeCounts } from '../lib/randomSampler.js';
import { largestRemainder } from '../lib/distribute.js';

const STEPS = [
  ['Sample', 'Generate a fresh action plan, or use our prepared one.'],
  ['Schedule', 'The allocator places each activity against real availability.'],
  ['Explore', 'Browse the calendar; tune the daily cap and see skips adapt.'],
];

/** Title-case a bank role for display, e.g. "personal trainer" → "Trainer". */
function roleLabel(role) {
  const short = role.replace(/^(personal |sports medicine )/, '');
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/**
 * @param {{
 *   bank: ReturnType<typeof import('../ui/aggregate.js').buildBankSummary>,
 *   onUseBundled: () => void,
 *   onSample: (req: { activityCount: number, distribution: Record<string, number> }) => void,
 *   loading: boolean,
 *   error: string | null,
 *   theme: string,
 *   onToggleTheme: () => void,
 * }} props
 */
export function WelcomePage({
  bank,
  onUseBundled,
  onSample,
  loading,
  error,
  theme,
  onToggleTheme,
}) {
  const [count, setCount] = useState(100);
  // Type-mix as PERCENTAGES that always sum to 100. Dragging one slider
  // redistributes the remainder across the others proportionally, so every
  // thumb moves and the thumbs always agree with the displayed counts.
  const [mix, setMix] = useState({
    fitness: 40,
    food: 20,
    medication: 15,
    therapy: 15,
    consultation: 10,
  });

  // Set one type's percentage; redistribute the rest to keep the sum at 100.
  const setMixValue = (type, value) => {
    const newVal = Math.max(0, Math.min(100, value));
    const others = TYPE_ORDER.filter((t) => t !== type);
    const othersTotal = others.reduce((n, t) => n + (mix[t] || 0), 0);
    const remaining = 100 - newVal;
    const shares =
      othersTotal > 0
        ? Object.fromEntries(others.map((t) => [t, mix[t] || 0]))
        : Object.fromEntries(others.map((t) => [t, 1])); // equal split
    const distributed = largestRemainder(shares, remaining);
    // largestRemainder omits zero-weight keys; ensure every "other" type is set.
    const filled = Object.fromEntries(
      others.map((t) => [t, distributed[t] ?? 0]),
    );
    setMix({ [type]: newVal, ...filled });
  };

  // mix already sums to 100, so the fraction is simply pct/100.
  const distribution = {};
  for (const t of TYPE_ORDER) distribution[t] = (mix[t] || 0) / 100;
  const resolvedCounts = typeCounts(count, distribution);

  const submitSample = () => {
    onSample({ activityCount: count, distribution });
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-6 sm:py-14">
        {/* Top bar: brand + theme toggle, spanning the full content width */}
        <div className="mb-6 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-400">
            <Sparkle size={18} weight="duotone" />
            Elyx Resource Allocator
          </p>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {/* Intro */}
        <header className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Turn a health action plan into a livable calendar.
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-300">
            HealthSpan AI decides what a member should do; the allocator decides
            when it can actually happen — scheduling each activity around the
            member's life and the availability of the care team, equipment, and
            venues over a 3-month horizon.
          </p>
        </header>

        {/* How to use */}
        <ol className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li
              key={title}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 font-mono text-xs text-white dark:bg-teal-500">
                {i + 1}
              </span>
              <h3 className="mt-2 text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_22rem]">
          {/* Left: customize + actions */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Customize the action plan
            </h2>

            <div className="mt-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
              {/* Activity count */}
              <label className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 text-zinc-600 dark:text-zinc-300">
                  Activities
                </span>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="h-1 flex-1 cursor-pointer accent-teal-600 dark:accent-teal-400"
                />
                <span className="w-10 text-right font-mono tabular-nums">
                  {count}
                </span>
              </label>

              {/* Type mix */}
              <p className="mt-5 mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Type mix
              </p>
              <div className="flex flex-col gap-2.5">
                {TYPE_ORDER.map((t) => (
                  <label key={t} className="flex items-center gap-3 text-sm">
                    <span className="flex w-32 shrink-0 items-center gap-1.5">
                      <TypeIcon
                        type={t}
                        size={15}
                        className={TYPE_STYLE[t].text}
                      />
                      {TYPE_STYLE[t].label}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={mix[t]}
                      onChange={(e) => setMixValue(t, Number(e.target.value))}
                      className="h-1 flex-1 cursor-pointer accent-teal-600 dark:accent-teal-400"
                    />
                    <span className="w-10 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                      {resolvedCounts[t] ?? 0}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                <Warning
                  size={15}
                  weight="duotone"
                  className="mt-0.5 shrink-0"
                />
                {error} Falling back to the prepared sample data.
              </p>
            ) : null}

            {/* Actions */}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={submitSample}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition active:translate-y-px hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-teal-500 dark:hover:bg-teal-400"
              >
                <Sparkle size={17} weight="duotone" />
                {loading ? 'Sampling…' : 'Sample new data'}
              </button>
              <button
                type="button"
                onClick={onUseBundled}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold transition active:translate-y-px hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <FolderOpen size={17} weight="duotone" />
                Use our sample data
              </button>
            </div>
          </section>

          {/* Right: read-only bank context */}
          <aside>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Care team &amp; facilities
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              The fixed resources every plan is scheduled against
            </p>

            <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <Users
                  size={15}
                  weight="duotone"
                  className="text-teal-600 dark:text-teal-400"
                />
                Care team
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {bank.team.map((r) => (
                  <li
                    key={r.role}
                    className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300"
                  >
                    <span className="flex items-center gap-1.5">
                      {roleLabel(r.role)}
                      {r.count > 1 ? (
                        <span className="font-mono text-zinc-400">
                          ×{r.count}
                        </span>
                      ) : null}
                      {r.remote ? (
                        <VideoCamera
                          size={13}
                          className="text-zinc-400"
                          title="Available remotely"
                        />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              <h3 className="mt-4 flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <Buildings
                  size={15}
                  weight="duotone"
                  className="text-teal-600 dark:text-teal-400"
                />
                Facilities &amp; equipment
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {bank.venues.map((v) => (
                  <li key={v.location} className="text-xs">
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">
                      {v.location}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {' '}
                      — {v.items.join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
