/**
 * @file [DISABLED — D55] Vercel serverless function: POST /api/sample
 *
 * The live LLM (Groq) sampler is preserved for reference but NOT deployed: the
 * UI now uses a client-side random sampler (`src/lib/randomSampler.js`) that is
 * instant, key-free, and rate-limit-free. To re-enable, move this file back to
 * `api/sample.js`, restore `src/lib/sampleClient.js` usage in `App.jsx`, set
 * `GROQ_API_KEY` in Vercel env, and re-enable the `/api` rewrite in vercel.json.
 *
 * (Original notes below.)
 *
 * Server-side Groq proxy (D48). The GROQ_API_KEY lives ONLY here as an env var;
 * the browser calls this endpoint, so the key never ships in the bundle.
 *
 * Samples ONLY the Action Plan (D47) — availability stays the deterministic
 * 3-month bank. The sampled plan is constrained by the prompt to reference the
 * fixed resource bank (D49) and is Zod-validated by `sampleActionPlan` before
 * it is returned, so scheduler input can never drift.
 *
 * Request body (all optional):
 *   { activityCount?: number, distribution?: Record<activityType, number> }
 * Response:
 *   200 { actionPlan: Activity[], model: string }
 *   4xx/5xx { error: string }
 */

import {
  sampleActionPlanByType,
  DEFAULT_SAMPLER_CONFIG,
} from '../src/lib/sampler.js'; // path valid when restored to api/

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.3-70b follows the "EXACTLY N per type" counts best (measured ~64/70 vs
// ~33/70 for llama-4-scout). Its 12K TPM is tight, but the multi-key rotation +
// count-capped buckets keep each call well under it. Override via GROQ_MODEL.
// (Rejected: gpt-oss/* reasoning models truncate; groq/compound* agentic systems
// wrap output in non-JSON; llama-4-scout has 30K TPM but under-delivers counts.)
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

/** Read + JSON-parse the request body across Vercel/Vite/Node runtimes. */
function readJsonBody(req) {
  // Vercel may pre-parse the body into an object/string.
  if (req.body && typeof req.body === 'object')
    return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    const s = req.body.trim();
    return Promise.resolve(s ? JSON.parse(s) : {});
  }
  // Otherwise read the raw stream via events (works under Vite's dev AND
  // preview servers, where the async-iterator form can hang).
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/** Sleep helper for rate-limit backoff. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse one or more Groq API keys from an env value (comma/whitespace
 * separated). Multiple keys let us round-robin per-type calls across separate
 * TPM budgets (D52), so 5 parallel calls don't blow a single key's ~12K TPM.
 * @param {string|undefined} raw
 * @returns {string[]}
 */
export function parseKeys(raw) {
  return String(raw ?? '')
    .split(/[,\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Build a Groq-backed invokeLLM(prompt) => Promise<string> adapter over a POOL
 * of keys. Each call takes the next key round-robin; on a rate-limit (HTTP
 * 429/413) it rotates to a DIFFERENT key and backs off, so a momentarily
 * throttled key doesn't fail the call. Honors Retry-After when present.
 * @param {string[]} keys
 * @param {string} model
 */
function makeGroqInvoke(keys, model, { maxRetries = 5 } = {}) {
  let cursor = 0;
  const nextKey = () => keys[cursor++ % keys.length];

  return async (prompt) => {
    let attempt = 0;
    let key = nextKey();
    for (;;) {
      const resp = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          // A bucket holds ~2 types (≤~30 rows). Sized to stay within a single
          // key's TPM (Groq free ≈ 12K) while leaving room for the response.
          max_tokens: 4500,
          messages: [
            {
              role: 'system',
              content:
                'You are a precise data generator. Output ONLY valid JSON, ' +
                'no markdown fences, no prose.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) {
          throw new Error('Groq returned an empty completion');
        }
        return text;
      }

      // Rate limited. Rotate to a DIFFERENT key and retry it immediately — the
      // throttled key's Retry-After does not apply to a fresh key. Only sleep
      // once we've cycled through every key (all are throttled). This avoids a
      // long stall when just one key is in TPM cooldown.
      if (
        (resp.status === 429 || resp.status === 413) &&
        attempt < maxRetries
      ) {
        attempt += 1;
        key = nextKey();
        const cycledAllKeys = attempt % keys.length === 0;
        if (cycledAllKeys) {
          const retryAfter = Number(resp.headers.get('retry-after'));
          const waitMs = Number.isFinite(retryAfter)
            ? Math.min(retryAfter * 1000, 8000)
            : Math.min(1000 * 2 ** Math.floor(attempt / keys.length), 8000);
          await sleep(waitMs);
        }
        continue;
      }

      const detail = await resp.text().catch(() => '');
      throw new Error(`Groq ${resp.status}: ${detail.slice(0, 300)}`);
    }
  };
}

/** Clamp the requested activity count into a safe range for live sampling. */
function clampCount(n) {
  const v = Number.isFinite(n)
    ? Math.floor(n)
    : DEFAULT_SAMPLER_CONFIG.activityCount;
  // Live sampling runs against free-tier token limits; allow up to ~100 (the
  // assignment's headline count) but not unbounded. Bucketing + backoff handle
  // the token cost; the bundled dataset still covers the ≥100 release gate.
  return Math.max(20, Math.min(100, v));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed; use POST' });
    return;
  }

  const keys = parseKeys(process.env.GROQ_API_KEY);
  if (keys.length === 0) {
    res
      .status(500)
      .json({ error: 'Server is missing GROQ_API_KEY; use the bundled data.' });
    return;
  }
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  try {
    const body = await readJsonBody(req);
    const config = {
      ...DEFAULT_SAMPLER_CONFIG,
      activityCount: clampCount(body.activityCount),
      distribution: body.distribution ?? DEFAULT_SAMPLER_CONFIG.distribution,
    };

    const { activities, errors, counts } = await sampleActionPlanByType({
      invokeLLM: makeGroqInvoke(keys, model),
      config,
      // Cap each call at ~21 activities so none truncates; big types split
      // across calls (fitness 28 → 14+14). The adapter rotates keys + backs
      // off on 429/413 as a safety net.
      maxPerBucket: 21,
      // Only fall back to bundled data on a NEAR-TOTAL failure (most buckets
      // rate-limited). A merely smaller-than-requested plan (e.g. 28 of 40 after
      // dedup) is still perfectly usable and should render, not be discarded.
      minKept: 10,
    });

    res.status(200).json({
      actionPlan: activities,
      model,
      counts,
      failedTypes: errors.flatMap((e) => e.types),
    });
  } catch (err) {
    res.status(502).json({ error: err?.message ?? 'Sampling failed' });
  }
}
