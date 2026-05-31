/**
 * @file Fixed activity-type legend. Each entry shows the type's color dot (as
 * used in the Month view) AND its icon (as used in Week/Day blocks), so both
 * encodings are decodable at a glance.
 */

import { TYPE_STYLE, TYPE_ORDER } from '../ui/encoding.js';
import { TypeIcon } from '../ui/icons.jsx';

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {TYPE_ORDER.map((type) => (
        <span
          key={type}
          className={`inline-flex items-center gap-1.5 text-xs font-medium ${TYPE_STYLE[type].text}`}
        >
          <TypeIcon type={type} size={14} />
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
