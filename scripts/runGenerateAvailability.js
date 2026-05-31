/**
 * @file Generate the constraint availability dataset and write it as normalized
 * CSVs into src/data/. Validates the whole bundle against the Constraints Zod
 * schema before writing.
 *
 * Run: bun run scripts/runGenerateAvailability.js
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Constraints } from '../src/lib/schemas.js';
import { generateConstraints } from './availabilityData.js';
import {
  toConstraintCsvs,
  CONSTRAINT_FILES,
} from '../src/lib/constraintsCsv.js';

const OUT_DIR = join(import.meta.dir, '..', 'src', 'data');

function main() {
  const raw = generateConstraints();
  const constraints = Constraints.parse(raw); // validate + apply defaults

  const csvs = toConstraintCsvs(constraints);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, CONSTRAINT_FILES.resources),
    csvs.resources,
    'utf8',
  );
  writeFileSync(
    join(OUT_DIR, CONSTRAINT_FILES.resourceWindows),
    csvs.resourceWindows,
    'utf8',
  );
  writeFileSync(
    join(OUT_DIR, CONSTRAINT_FILES.clientSchedule),
    csvs.clientSchedule,
    'utf8',
  );
  writeFileSync(join(OUT_DIR, CONSTRAINT_FILES.travel), csvs.travel, 'utf8');

  const totalWindows = [
    ...constraints.equipment,
    ...constraints.specialists,
    ...constraints.alliedHealth,
  ].reduce((n, r) => n + r.availability.length + r.downtime.length, 0);
  console.log('Constraints generated and validated:');
  console.log(`  equipment:       ${constraints.equipment.length}`);
  console.log(`  specialists:     ${constraints.specialists.length}`);
  console.log(`  alliedHealth:    ${constraints.alliedHealth.length}`);
  console.log(`  resource windows:${totalWindows}`);
  console.log(`  clientSchedule:  ${constraints.clientSchedule.length}`);
  console.log(`  travel:          ${constraints.travel.length}`);
  console.log(`-> ${OUT_DIR}/{${Object.values(CONSTRAINT_FILES).join(', ')}}`);
}

main();
