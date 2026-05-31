/**
 * @file Aggregate the sampled action-plan batches into action_plan.csv.
 *
 * Reads temp/action_plan_batches/batch-*.json (produced by the sampler
 * subagents), validates EVERY activity against the Zod Activity schema, checks
 * id uniqueness, sorts by priority then id, and writes a single CSV.
 *
 * Run: bun run scripts/runAggregateActionPlan.js
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Activity } from '../src/lib/schemas.js';
import { toCsv } from '../src/lib/csv.js';
import {
  activityToRow,
  ACTION_PLAN_COLUMNS,
} from '../src/lib/actionPlanCsv.js';
import {
  transformActivity,
  HARD_ACTIVITIES,
  postProcessPlan,
} from './transformActionPlan.js';

const BATCH_DIR = join(import.meta.dir, '..', 'temp', 'action_plan_batches');
const OUT_DIR = join(import.meta.dir, '..', 'src', 'data');
const OUT_FILE = join(OUT_DIR, 'action_plan.csv');

function main() {
  const files = readdirSync(BATCH_DIR)
    .filter((f) => /^batch-\d+\.json$/.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)[0]);
      const nb = Number(b.match(/\d+/)[0]);
      return na - nb;
    });

  if (files.length === 0) {
    throw new Error(`No batch files found in ${BATCH_DIR}`);
  }

  /** @type {import('../src/lib/schemas.js').Activity[]} */
  const all = [];
  const seen = new Set();

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(BATCH_DIR, file), 'utf8'));
    if (!Array.isArray(raw)) {
      throw new Error(`${file} is not a JSON array`);
    }
    raw.forEach((obj, idx) => {
      let activity;
      try {
        activity = Activity.parse(transformActivity(obj)); // transform+validate
      } catch (err) {
        throw new Error(
          `${file}[${idx}] failed schema validation: ${err.message}`,
          { cause: err },
        );
      }
      if (seen.has(activity.id)) {
        throw new Error(`Duplicate activity id "${activity.id}" in ${file}`);
      }
      seen.add(activity.id);
      all.push(activity);
    });
    console.log(`  ${file}: ${raw.length} activities`);
  }

  // Append the deliberately-hard-but-valid activities.
  for (const obj of HARD_ACTIVITIES) {
    const activity = Activity.parse(obj);
    if (seen.has(activity.id)) {
      throw new Error(`Duplicate hard activity id "${activity.id}"`);
    }
    seen.add(activity.id);
    all.push(activity);
  }
  console.log(`  hard activities: ${HARD_ACTIVITIES.length}`);

  // Post-process: consolidate supplements into stacks + mark guidelines (D32/D33).
  const processed = postProcessPlan(all).map((a) => Activity.parse(a));

  // Stable order: priority asc, then id asc.
  processed.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  const rows = processed.map(activityToRow);
  const csv = toCsv(rows, ACTION_PLAN_COLUMNS);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, csv, 'utf8');

  // Quick distribution for sanity.
  const dist = processed.reduce(
    (m, a) => ((m[a.activityType] = (m[a.activityType] || 0) + 1), m),
    {},
  );
  console.log(`\nAggregated ${processed.length} activities -> ${OUT_FILE}`);
  console.log('Type distribution:', dist);
}

main();
