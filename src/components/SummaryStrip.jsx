/**
 * @file Compact metrics strip for the visible range: how many events were
 * scheduled, substituted, and skipped. Plain layout with hairline dividers.
 */

/**
 * @param {{ placed: number, backup: number, skipped: number }} props
 */
export function SummaryStrip({ placed, backup, skipped }) {
  const items = [
    { label: 'Scheduled', value: placed },
    { label: 'Substituted', value: backup },
    { label: 'Skipped', value: skipped },
  ];

  return (
    <dl className="flex items-stretch divide-x divide-zinc-200 dark:divide-zinc-800">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col px-4 first:pl-0">
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {it.label}
          </dt>
          <dd className="font-mono text-lg tabular-nums text-zinc-900 dark:text-zinc-100">
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
