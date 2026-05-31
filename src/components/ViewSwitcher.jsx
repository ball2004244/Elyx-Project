/**
 * @file Segmented Day / Week / Month view switcher.
 */

const MODES = ['day', 'week', 'month'];
const LABEL = { day: 'Day', week: 'Week', month: 'Month' };

/**
 * @param {{ mode: string, onChange: (m: string) => void }} props
 */
export function ViewSwitcher({ mode, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700"
    >
      {MODES.map((m) => {
        const active = m === mode;
        return (
          <button
            key={m}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(m)}
            className={[
              'rounded-md px-3 py-1 text-xs font-medium transition',
              active
                ? 'bg-teal-600 text-white dark:bg-teal-500'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
            ].join(' ')}
          >
            {LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}
