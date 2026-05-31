/**
 * @file The Daily Protocol panel: the member's constant routine, grouped by
 * type as a COLLAPSIBLE accordion (collapsed by default). The header shows
 * summary chips so the whole protocol reads as one glanceable line until a
 * group is expanded.
 */

import { useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { TypeIcon } from '../ui/icons.jsx';
import { TYPE_STYLE } from '../ui/encoding.js';

/**
 * @param {{ protocol: { type: string, items: object[] }[] }} props
 */
export function DailyProtocol({ protocol }) {
  const [open, setOpen] = useState(null); // which type is expanded
  const total = protocol.reduce((n, g) => n + g.items.length, 0);

  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <CheckCircle size={18} className="text-teal-600 dark:text-teal-400" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Daily Protocol
        </h2>
        <span className="font-mono text-xs text-zinc-400">{total}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {protocol.map((g) => (
            <span
              key={g.type}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${TYPE_STYLE[g.type].dot}`}
              />
              {TYPE_STYLE[g.type].label}
              <span className="font-mono">{g.items.length}</span>
            </span>
          ))}
        </div>
      </header>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {protocol.map((group) => {
          const isOpen = open === group.type;
          return (
            <div key={group.type}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : group.type)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <TypeIcon type={group.type} size={15} />
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {TYPE_STYLE[group.type].label}
                </span>
                <span className="font-mono text-xs text-zinc-400">
                  {group.items.length}
                </span>
                <CaretDown
                  size={14}
                  className={[
                    'ml-auto text-zinc-400 transition-transform',
                    isOpen ? 'rotate-180' : '',
                  ].join(' ')}
                />
              </button>
              {isOpen ? (
                <ul className="flex flex-col gap-1.5 px-4 pb-3 pl-11">
                  {group.items.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-start justify-between gap-2 text-[13px] leading-snug text-zinc-700 dark:text-zinc-300"
                    >
                      <span>{it.details}</span>
                      <span className="shrink-0 font-mono text-[11px] text-zinc-400">
                        {it.cadence}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
