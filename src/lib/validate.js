/**
 * @file Referential-integrity validation between the Action Plan and the
 * resource bank / Constraints (decision d).
 *
 * The closed-world assumption is: every resource an activity references must
 * exist and be satisfiable by the bank. This validator REPORTS violations; it
 * does not mutate data. The scheduler, separately, treats an unresolvable
 * resource as simply "unavailable" (→ substitution/backup/skip), so dangling
 * references degrade gracefully instead of crashing. Demo data stays clean;
 * these paths are proven by tests with synthetic broken input.
 */

/**
 * @typedef {object} ValidationIssue
 * @property {string} activityId
 * @property {'facilitatorResource'|'facilitatorRole'} kind
 * @property {string} ref      The missing/unsatisfiable reference.
 * @property {string} message
 */

/**
 * @param {import('./schemas.js').Activity[]} actionPlan
 * @param {import('./schemas.js').Constraints} constraints
 * @returns {{ ok: boolean, issues: ValidationIssue[] }}
 */
export function validateReferences(actionPlan, constraints) {
  const providers = [...constraints.specialists, ...constraints.alliedHealth];
  const providerIds = new Set(providers.map((p) => p.id));
  const providerRoles = new Set(providers.map((p) => p.role));

  /** @type {ValidationIssue[]} */
  const issues = [];

  for (const a of actionPlan) {
    const f = a.facilitator;
    if (f.type === 'self') continue;

    if (f.resourceId && !providerIds.has(f.resourceId)) {
      issues.push({
        activityId: a.id,
        kind: 'facilitatorResource',
        ref: f.resourceId,
        message: `Pinned facilitator "${f.resourceId}" not found in the bank`,
      });
    }
    // Role must be satisfiable by at least one provider (when not pinned).
    if (!f.resourceId && f.role && !providerRoles.has(f.role)) {
      issues.push({
        activityId: a.id,
        kind: 'facilitatorRole',
        ref: f.role,
        message: `No provider with role "${f.role}" in the bank`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
