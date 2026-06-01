/**
 * @file Runtime data loader for the app. Imports the static CSVs as raw text
 * (Vite `?raw`), parses them into validated domain objects, runs the scheduler,
 * and returns everything the UI needs.
 *
 * Keeps all file-format concerns in one place so components stay declarative.
 */

import actionPlanCsv from '../data/action_plan.csv?raw';
import resourcesCsv from '../data/resources.csv?raw';
import resourceWindowsCsv from '../data/resource_windows.csv?raw';
import clientScheduleCsv from '../data/client_schedule.csv?raw';
import travelCsv from '../data/travel.csv?raw';

import { parseCsv } from './csv.js';
import { loadActivities } from './actionPlanCsv.js';
import { fromConstraintCsvs } from './constraintsCsv.js';
import { schedule } from '../scheduler/schedule.js';
import { deriveHorizon } from '../scheduler/index.js';

/** Parse + validate the bundled constraint CSVs once (memoized). */
let _constraints = null;
function bundledConstraints() {
  if (!_constraints) {
    _constraints = fromConstraintCsvs({
      resources: resourcesCsv,
      resourceWindows: resourceWindowsCsv,
      clientSchedule: clientScheduleCsv,
      travel: travelCsv,
    });
  }
  return _constraints;
}

/**
 * Build the loaded-data bundle from a given set of activities + the bundled
 * constraints. Shared by the static loader and the live sampler (D47): the
 * sampler swaps the action plan but keeps the deterministic 3-month constraints.
 * @param {import('./schemas.js').Activity[]} activities
 * @param {{ row: number, id: string, message: string }[]} [loadErrors]
 */
export function buildData(activities, loadErrors = []) {
  const constraints = bundledConstraints();
  const horizon = deriveHorizon(constraints);
  const activityById = new Map(activities.map((a) => [a.id, a]));
  return { activities, constraints, horizon, loadErrors, activityById };
}

/**
 * Parse + validate the static CSVs (no scheduling). Call once; the scheduler is
 * re-run separately whenever workload options change.
 * @returns {{
 *   activities: import('./schemas.js').Activity[],
 *   constraints: import('./schemas.js').Constraints,
 *   horizon: { startDay: string, endDay: string },
 *   loadErrors: { row: number, id: string, message: string }[],
 *   activityById: Map<string, import('./schemas.js').Activity>,
 * }}
 */
export function loadData() {
  const { activities, errors: loadErrors } = loadActivities(
    parseCsv(actionPlanCsv),
  );
  return buildData(activities, loadErrors);
}

/**
 * Load data and run the scheduler once (convenience for tests / scripts).
 * @param {{ maxEventsPerDay?: number, eventBufferMin?: number }} [opts]
 */
export function loadAll(opts = {}) {
  const data = loadData();
  const plan = schedule(data.activities, data.constraints, data.horizon, opts);
  return { ...data, plan };
}
