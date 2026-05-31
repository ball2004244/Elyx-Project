/**
 * @file Generate a QUARANTINED messy action-plan sample for robustness testing.
 *
 * This file is NEVER loaded by the app. It exists only so tests (and an optional
 * demo toggle) can prove the loader degrades gracefully on structurally messy
 * input: malformed rows, missing/extra fields, bad types, dangling references,
 * and unit inconsistencies. The default src/data/action_plan.csv stays clean.
 *
 * Run: bun run scripts/runGenerateMessySample.js
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, toCsv } from '../src/lib/csv.js';
import { ACTION_PLAN_COLUMNS } from '../src/lib/actionPlanCsv.js';

const DATA = join(import.meta.dir, '..', 'src', 'data');
const SRC = join(DATA, 'action_plan.csv');
const OUT = join(DATA, 'messy_sample.csv');

function main() {
  // Take the first 8 clean rows as a base, then inject realistic mess.
  const clean = parseCsv(readFileSync(SRC, 'utf8')).slice(0, 8);

  const messy = [...clean];

  // 1) Bad type: non-numeric priority.
  messy.push({
    ...clean[0],
    id: 'act-bad-priority',
    priority: 'high', // should be a number
  });

  // 2) Missing required field: empty activityType.
  messy.push({
    ...clean[1],
    id: 'act-missing-type',
    activityType: '',
  });

  // 3) Invalid enum: unknown frequency period.
  messy.push({
    ...clean[2],
    id: 'act-bad-period',
    frequencyPeriod: 'fortnight',
  });

  // 4) Dangling reference: a pinned facilitator id not in the bank.
  messy.push({
    ...clean[3],
    id: 'act-dangling-facilitator',
    facilitatorType: 'specialist',
    facilitatorRole: 'cardiologist',
    facilitatorResourceId: 'sp-999',
  });

  // 5) Unit inconsistency in details (kept as a VALID row — units are free text,
  //    so this row still loads; it documents the mg/dL vs mmol/L hazard).
  messy.push({
    ...clean[4],
    id: 'act-unit-mismatch',
    details: 'Target glucose 5.5 mmol/L (note: labs report mg/dL elsewhere)',
  });

  // 6) Empty id (required, non-empty).
  messy.push({ ...clean[5], id: '' });

  const csv = toCsv(messy, ACTION_PLAN_COLUMNS);
  writeFileSync(OUT, csv, 'utf8');
  console.log(`Wrote ${messy.length} rows (clean + injected mess) -> ${OUT}`);
}

main();
