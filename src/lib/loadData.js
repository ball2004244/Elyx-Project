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

/**
 * Load data, validate, and run the scheduler once.
 * @returns {{
 *   activities: import('./schemas.js').Activity[],
 *   constraints: import('./schemas.js').Constraints,
 *   plan: import('./schemas.js').ScheduledInstance[],
 *   horizon: { startDay: string, endDay: string },
 *   loadErrors: { row: number, id: string, message: string }[],
 *   activityById: Map<string, import('./schemas.js').Activity>,
 * }}
 */
export function loadAll() {
  const { activities, errors: loadErrors } = loadActivities(
    parseCsv(actionPlanCsv),
  );

  const constraints = fromConstraintCsvs({
    resources: resourcesCsv,
    resourceWindows: resourceWindowsCsv,
    clientSchedule: clientScheduleCsv,
    travel: travelCsv,
  });

  const horizon = deriveHorizon(constraints);
  const plan = schedule(activities, constraints, horizon);
  const activityById = new Map(activities.map((a) => [a.id, a]));

  return { activities, constraints, plan, horizon, loadErrors, activityById };
}
