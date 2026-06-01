/**
 * @file App header: title, member name, view switcher, range navigation, and
 * theme toggle. Single-line at desktop, height within the nav cap.
 */

import { CaretLeft } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight';
import { CaretDoubleLeft } from '@phosphor-icons/react/dist/csr/CaretDoubleLeft';
import { Sun } from '@phosphor-icons/react/dist/csr/Sun';
import { Moon } from '@phosphor-icons/react/dist/csr/Moon';
import { ArrowsClockwise } from '@phosphor-icons/react/dist/csr/ArrowsClockwise';
import { ViewSwitcher } from './ViewSwitcher.jsx';

/**
 * @param {{
 *   memberName: string,
 *   rangeLabel: string,
 *   mode: string,
 *   onMode: (m: string) => void,
 *   canPrev: boolean,
 *   canNext: boolean,
 *   onPrev: () => void,
 *   onNext: () => void,
 *   onStart: () => void,
 *   onRestart?: () => void,
 *   theme: string,
 *   onToggleTheme: () => void,
 * }} props
 */
export function Topbar({
  memberName,
  rangeLabel,
  mode,
  onMode,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onStart,
  onRestart,
  theme,
  onToggleTheme,
}) {
  const navBtn =
    'flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 ' +
    'transition hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent ' +
    'dark:text-zinc-300 dark:hover:bg-zinc-800';

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-zinc-200 px-4 sm:px-6 dark:border-zinc-800">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Elyx Resource Allocator
        </h1>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {memberName}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <ViewSwitcher mode={mode} onChange={onMode} />
        <button
          type="button"
          className={navBtn}
          onClick={onStart}
          disabled={!canPrev}
          aria-label="Jump to first day"
          title="Jump to start"
        >
          <CaretDoubleLeft size={16} weight="bold" />
        </button>
        <button
          type="button"
          className={navBtn}
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Previous"
        >
          <CaretLeft size={16} weight="bold" />
        </button>
        <span className="hidden w-36 text-center text-sm font-medium text-zinc-700 sm:block dark:text-zinc-300">
          {rangeLabel}
        </span>
        <button
          type="button"
          className={navBtn}
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next"
        >
          <CaretRight size={16} weight="bold" />
        </button>
        {onRestart ? (
          <button
            type="button"
            onClick={onRestart}
            className="ml-1 flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ArrowsClockwise size={14} weight="bold" />
            New plan
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
