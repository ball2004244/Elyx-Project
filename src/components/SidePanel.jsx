/**
 * @file Right-hand panel. Two jobs:
 *  1. Detail of the currently-selected instance (facilitator, equipment,
 *     metrics, remote, and the scheduler's note).
 *  2. The skipped list grouped BY REASON (collapsible) with plain-language
 *     explanations — answers "why are there so many skips?".
 */

import { useState } from 'react';
import { Warning } from '@phosphor-icons/react/dist/csr/Warning';
import { Info } from '@phosphor-icons/react/dist/csr/Info';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown';
import { TypeIcon } from '../ui/icons.jsx';
import { TYPE_STYLE, KIND_LABEL, clock } from '../ui/encoding.js';

function DetailRow({ label, value }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-right font-medium text-zinc-800 dark:text-zinc-200">
        {Array.isArray(value) ? value.join(', ') : value}
      </span>
    </div>
  );
}

function SelectedDetail({ instance, activity, onClear }) {
  const type = activity?.activityType ?? 'consultation';
  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <TypeIcon type={type} size={18} />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {TYPE_STYLE[type].label}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Close detail"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X size={16} />
        </button>
      </div>
      <p className="mb-3 text-sm leading-snug text-zinc-700 dark:text-zinc-300">
        {activity?.details}
      </p>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        <DetailRow
          label="When"
          value={`${instance.window.start.slice(0, 10)} · ${clock(instance.window.start)}`}
        />
        <DetailRow label="Status" value={KIND_LABEL[instance.kind]} />
        <DetailRow label="Facilitator" value={instance.facilitatorId} />
        <DetailRow label="Equipment" value={instance.equipmentIds} />
        <DetailRow label="Remote" value={instance.isRemote ? 'Yes' : null} />
        <DetailRow label="Metrics" value={instance.metrics} />
      </div>
      {instance.note ? (
        <p className="mt-3 flex gap-2 rounded-lg bg-zinc-100 p-2.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <Info size={15} className="mt-px shrink-0" />
          {instance.note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   selected: object | null,
 *   activityById: Map<string, object>,
 *   skippedByReason: object[],
 *   onClear: () => void,
 * }} props
 */
export function SidePanel({
  selected,
  activityById,
  skippedByReason,
  onClear,
}) {
  const [openReason, setOpenReason] = useState(null);
  const totalSkips = skippedByReason.reduce((n, g) => n + g.count, 0);

  return (
    <aside className="flex flex-col gap-5">
      {selected ? (
        <SelectedDetail
          instance={selected}
          activity={activityById.get(selected.activityId)}
          onClear={onClear}
        />
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Select an activity to see its facilitator, equipment, metrics, and any
          scheduling notes.
        </p>
      )}

      <div>
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <Warning size={16} className="text-amber-500" />
          Skipped occurrences
          <span className="font-mono text-xs text-zinc-400">{totalSkips}</span>
        </h3>
        {skippedByReason.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nothing skipped across the program.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              These could not be placed; the plan adapts around them.
            </p>
            <ul className="flex flex-col gap-1.5">
              {skippedByReason.map((g) => {
                const isOpen = openReason === g.reason;
                return (
                  <li
                    key={g.reason}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenReason(isOpen ? null : g.reason)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                    >
                      <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        {g.label}
                      </span>
                      <span className="rounded bg-amber-100 px-1.5 font-mono text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        {g.count}
                      </span>
                      <CaretDown
                        size={13}
                        className={[
                          'ml-auto text-zinc-400 transition-transform',
                          isOpen ? 'rotate-180' : '',
                        ].join(' ')}
                      />
                    </button>
                    {isOpen ? (
                      <div className="px-2.5 pb-2.5">
                        <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {g.explanation}
                        </p>
                        <ul className="flex flex-col gap-1">
                          {g.items.slice(0, 8).map((it) => (
                            <li
                              key={it.activityId}
                              className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400"
                            >
                              <TypeIcon
                                type={it.type}
                                size={12}
                                className="shrink-0 opacity-70"
                              />
                              <span className="truncate">{it.details}</span>
                              <span className="ml-auto shrink-0 font-mono text-zinc-400">
                                ×{it.count}
                              </span>
                            </li>
                          ))}
                          {g.items.length > 8 ? (
                            <li className="text-[11px] text-zinc-400">
                              +{g.items.length - 8} more
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
