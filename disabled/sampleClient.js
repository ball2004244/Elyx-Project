/**
 * @file Browser-side client for the /api/sample serverless endpoint (D48).
 *
 * The browser never holds the Groq key; it POSTs the sampling request to our
 * function and receives a Zod-validated Action Plan. Availability is NOT sampled
 * (D47) — the app keeps using the deterministic bundled constraint data.
 *
 * Callers should always be able to fall back to bundled data on failure (D50).
 */

/**
 * Request a freshly sampled Action Plan from the server.
 * @param {{ activityCount?: number, distribution?: Record<string, number>,
 *   signal?: AbortSignal }} [opts]
 * @returns {Promise<{ actionPlan: import('../src/lib/schemas.js').Activity[],
 *   failedTypes: string[], counts: Record<string, number>, model: string }>}
 * @throws if the request fails or the server returns an error payload
 */
export async function requestSampledActionPlan(opts = {}) {
  const { activityCount, distribution, signal } = opts;
  const resp = await fetch('/api/sample', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activityCount, distribution }),
    signal,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || `Sampling failed (${resp.status})`);
  }
  if (!Array.isArray(data.actionPlan)) {
    throw new Error('Server response missing actionPlan');
  }
  return {
    actionPlan: data.actionPlan,
    failedTypes: data.failedTypes ?? [],
    counts: data.counts ?? {},
    model: data.model ?? '',
  };
}
