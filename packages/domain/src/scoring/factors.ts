import type { FactorCategory, FactorDefinition, FactorScore } from './types.js';

/**
 * The 0–5 rubric scale. Exported because the scorecard UI (§14.3) has to render
 * every point on it next to its anchor text — the scale is part of the rubric,
 * not an implementation detail of the form control.
 */
export const FACTOR_SCALE: readonly FactorScore[] = Object.freeze([0, 1, 2, 3, 4, 5]);

/**
 * Factor registry v1 — PRD §11.2, verbatim.
 *
 * The version string is persisted on every score row (`factor_version`) so an
 * old score stays interpretable after the rubric changes. Never edit a factor's
 * weight or key in place: publish v2 and leave v1 frozen, or historical scores
 * silently stop reproducing.
 */
export const FACTOR_VERSION = 'v1' as const;

export const FACTORS: readonly FactorDefinition[] = Object.freeze([
  // ─── Business Value: 40 points ─────────────────────────────────────────────
  {
    key: 'outcome_impact',
    category: 'business_value',
    weight: 15,
    label: 'Outcome impact',
    anchorZero: 'No clear link to priority outcome',
    anchorFive: 'Direct and material link to top outcome',
  },
  {
    key: 'frequency_volume',
    category: 'business_value',
    weight: 10,
    label: 'Frequency / volume',
    anchorZero: 'Rare or one-off',
    anchorFive: 'High-frequency recurring workflow',
  },
  {
    key: 'cycle_time_opportunity',
    category: 'business_value',
    weight: 10,
    label: 'Cycle-time opportunity',
    anchorZero: 'No meaningful delay',
    anchorFive: 'Major repeated work or waiting time',
  },
  {
    key: 'strategic_visibility',
    category: 'business_value',
    weight: 5,
    label: 'Strategic visibility',
    anchorZero: 'Low-priority internal task',
    anchorFive: 'Executive-visible workflow or launch',
  },

  // ─── Feasibility: 30 points ────────────────────────────────────────────────
  {
    key: 'input_availability',
    category: 'feasibility',
    weight: 10,
    label: 'Input availability',
    anchorZero: 'Required inputs unavailable',
    anchorFive: 'Inputs accessible, structured and current',
  },
  {
    key: 'task_repeatability',
    category: 'feasibility',
    weight: 8,
    label: 'Task repeatability',
    anchorZero: 'Entirely novel judgment each time',
    anchorFive: 'Stable pattern with clear examples',
  },
  {
    key: 'workflow_fit',
    category: 'feasibility',
    weight: 6,
    label: 'Workflow fit',
    anchorZero: 'Requires major platform replacement',
    anchorFive: 'Fits current tools and approvals',
  },
  {
    key: 'clear_owner',
    category: 'feasibility',
    weight: 6,
    label: 'Clear owner',
    anchorZero: 'No owner or approver',
    anchorFive: 'Named owner, user and approver',
  },

  // ─── Risk Safety: 20 points. Higher means SAFER. ───────────────────────────
  {
    key: 'brand_claims_safety',
    category: 'risk_safety',
    weight: 6,
    label: 'Brand / claims safety',
    anchorZero: 'Uncontrolled high-impact claims',
    anchorFive: 'Clear rules and human approval',
  },
  {
    key: 'data_privacy_safety',
    category: 'risk_safety',
    weight: 6,
    label: 'Data / privacy safety',
    anchorZero: 'Prohibited or sensitive data is essential',
    anchorFive: 'Approved low-risk data only',
  },
  {
    key: 'legal_regulatory_safety',
    category: 'risk_safety',
    weight: 4,
    label: 'Legal / regulatory safety',
    anchorZero: 'Legal review unavailable for regulated output',
    anchorFive: 'Clear review path and accepted use',
  },
  {
    key: 'model_reliability',
    category: 'risk_safety',
    weight: 4,
    label: 'Model reliability',
    anchorZero: 'Errors cannot be detected before impact',
    anchorFive: 'Grounded output with effective evaluation',
  },

  // ─── Adoption Readiness: 10 points ─────────────────────────────────────────
  {
    key: 'executive_sponsor',
    category: 'adoption_readiness',
    weight: 3,
    label: 'Executive sponsor',
    anchorZero: 'None',
    anchorFive: 'Named and actively committed',
  },
  {
    key: 'user_pull',
    category: 'adoption_readiness',
    weight: 3,
    label: 'User pull',
    anchorZero: 'Users resist or see no value',
    anchorFive: 'Daily users request the change',
  },
  {
    key: 'approval_path',
    category: 'adoption_readiness',
    weight: 2,
    label: 'Approval path',
    anchorZero: 'Unknown or unavailable',
    anchorFive: 'Named reviewer and SLA',
  },
  {
    key: 'measurement_ability',
    category: 'adoption_readiness',
    weight: 2,
    label: 'Measurement ability',
    anchorZero: 'No measurable baseline or proxy',
    anchorFive: 'Baseline, KPI, source and owner available',
  },
]);

export const FACTOR_KEYS: readonly string[] = Object.freeze(FACTORS.map((f) => f.key));

const FACTORS_BY_KEY: ReadonlyMap<string, FactorDefinition> = new Map(
  FACTORS.map((f) => [f.key, f]),
);

export function getFactor(key: string): FactorDefinition | undefined {
  return FACTORS_BY_KEY.get(key);
}

/** §11.2 category totals: 40 / 30 / 20 / 10. */
export const CATEGORY_WEIGHTS: Readonly<Record<FactorCategory, number>> = Object.freeze({
  business_value: 40,
  feasibility: 30,
  risk_safety: 20,
  adoption_readiness: 10,
});

export const TOTAL_WEIGHT = 100;

/**
 * Structural guard, evaluated at import time against the live registry.
 *
 * §11.1 states factor weights sum to 100 points. If someone edits the registry
 * and breaks that, every score in the system silently shifts scale — so this
 * fails loudly at startup rather than producing plausible wrong numbers.
 *
 * Exported (rather than inlined) so the failure paths are directly testable;
 * a guard nobody can exercise is a guard nobody can trust.
 */
export function validateFactorRegistry(
  factors: readonly FactorDefinition[],
  version: string = FACTOR_VERSION,
): void {
  const total = factors.reduce((sum, f) => sum + f.weight, 0);
  if (total !== TOTAL_WEIGHT) {
    throw new Error(
      `Factor registry ${version} is malformed: weights sum to ${total}, expected ${TOTAL_WEIGHT}.`,
    );
  }

  for (const [category, expected] of Object.entries(CATEGORY_WEIGHTS)) {
    const actual = factors
      .filter((f) => f.category === category)
      .reduce((sum, f) => sum + f.weight, 0);
    if (actual !== expected) {
      throw new Error(
        `Factor registry ${version} is malformed: category "${category}" sums to ${actual}, expected ${expected}.`,
      );
    }
  }

  const keys = factors.map((f) => f.key);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Factor registry ${version} is malformed: duplicate factor keys.`);
  }
}

validateFactorRegistry(FACTORS);
