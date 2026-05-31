/**
 * @file Fixed activity-type legend. Documents the color encoding so users can
 * read the calendar at a glance (no decorative dots elsewhere — only here).
 */

import { TYPE_STYLE, TYPE_ORDER } from '../ui/encoding.js';
import { TypeIcon } from '../ui/icons.jsx';

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {TYPE_ORDER.map((type) => (
        <span
          key={type}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
        >
          <TypeIcon type={type} size={14} className="opacity-80" />
          {TYPE_STYLE[type].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-500">
        <span className="h-3 w-4 rounded border border-dashed border-current/60" />
        Substituted
      </span>
    </div>
  );
}
