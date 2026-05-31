/**
 * @file A single scheduled instance rendered as a compact agenda row.
 * Color encodes activity type; placement `kind` is shown by treatment
 * (solid primary, dashed backup) and a small badge.
 */

import { ArrowsClockwise } from '@phosphor-icons/react/dist/csr/ArrowsClockwise';
import { VideoCamera } from '@phosphor-icons/react/dist/csr/VideoCamera';
import { TypeIcon } from '../ui/icons.jsx';
import { TYPE_STYLE, KIND_LABEL, clock } from '../ui/encoding.js';
import { shortLabel } from '../ui/aggregate.js';

/**
 * @param {{
 *   instance: import('../lib/schemas.js').ScheduledInstance,
 *   activity: import('../lib/schemas.js').Activity,
 *   selected?: boolean,
 *   onSelect?: () => void,
 * }} props
 */
export function ActivityBlock({ instance, activity, selected, onSelect }) {
  const type = activity?.activityType ?? 'consultation';
  const style = TYPE_STYLE[type];
  const isBackup = instance.kind === 'backup';
  const label =
    shortLabel(activity?.details) || activity?.id || instance.activityId;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'group w-full rounded-lg px-2.5 py-2 text-left ring-1 transition',
        'hover:-translate-y-px hover:shadow-sm focus:outline-none',
        'focus-visible:ring-2 focus-visible:ring-teal-500',
        style.block,
        isBackup ? 'border border-dashed border-current/40' : '',
        selected ? 'ring-2 ring-teal-500' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5">
        <TypeIcon type={type} size={15} className="shrink-0 opacity-80" />
        <span className="font-mono text-[11px] tabular-nums opacity-70">
          {clock(instance.window.start)}
        </span>
        {instance.count > 1 ? (
          <span className="rounded bg-current/10 px-1 font-mono text-[10px] font-semibold tabular-nums">
            ×{instance.count}
          </span>
        ) : null}
        {instance.isRemote ? (
          <VideoCamera size={13} className="opacity-70" aria-label="Remote" />
        ) : null}
        {isBackup ? (
          <ArrowsClockwise
            size={13}
            className="ml-auto opacity-70"
            aria-label={KIND_LABEL.backup}
          />
        ) : null}
      </div>
      <p
        className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-snug"
        title={activity?.details || undefined}
      >
        {label}
      </p>
    </button>
  );
}
