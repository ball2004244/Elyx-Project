/**
 * @file Largest-remainder integer distribution — one shared implementation.
 *
 * Previously copy-pasted in three places (randomSampler.typeCounts,
 * sampler.computeTypeCounts, WelcomePage.distributeInts), which had already
 * drifted (two forced a min of 1 per key, one did not). Centralized here so the
 * count split is defined once.
 */

/**
 * Distribute an integer `total` across weighted keys so the parts sum EXACTLY
 * to `total`: floor each key's proportional share, then hand out the leftover
 * one at a time to the keys with the largest fractional remainder.
 *
 * Contract:
 *  - Keys with non-positive weight are omitted entirely.
 *  - Every positive-weight key is present in the result (0 is a valid count).
 *  - The returned counts sum to `max(0, total)` — so `total <= 0` yields all
 *    zeros (NOT a forced minimum of 1 per key). This is what makes
 *    `total: 0` produce an empty plan rather than one-per-type.
 *
 * @param {Record<string, number>} weights  key -> weight (need not sum to 1)
 * @param {number} total  target integer sum
 * @returns {Record<string, number>}
 */
export function largestRemainder(weights, total) {
  const keys = Object.keys(weights).filter((k) => (weights[k] ?? 0) > 0);
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  if (keys.length === 0 || !Number.isFinite(total) || total <= 0) {
    return counts;
  }

  const sum = keys.reduce((n, k) => n + weights[k], 0);
  const raw = keys.map((k) => ({ k, exact: (weights[k] / sum) * total }));

  let assigned = 0;
  for (const { k, exact } of raw) {
    counts[k] = Math.floor(exact);
    assigned += counts[k];
  }

  // Pure floor never overshoots, so the remainder is always >= 0.
  let remainder = total - assigned;
  const byFrac = [...raw].sort(
    (a, b) => (b.exact % 1) - (a.exact % 1) || b.exact - a.exact,
  );
  let i = 0;
  while (remainder > 0) {
    counts[byFrac[i % byFrac.length].k] += 1;
    remainder -= 1;
    i += 1;
  }
  return counts;
}
