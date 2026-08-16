/**
 * Opportunity scoring contracts — PRD §11.
 *
 * The whole point of this module is reproducibility: given the same saved
 * factors, the same score must come out, forever (§2.5, §32.1). That rules out
 * floating-point accumulation wherever integer arithmetic will do, and it rules
 * out any model call. Scores are calculated here, on the server, never in a
 * prompt (§10.2, §20.2).
 */

/** A factor is scored 0–5 by a human or a rubric, never by free-form model output. */
export type FactorScore = 0 | 1 | 2 | 3 | 4 | 5;

/** §11.2 — the four weighted categories, summing to 100 points. */
export type FactorCategory =
  'business_value' | 'feasibility' | 'risk_safety' | 'adoption_readiness';

/** §11.5 */
export type PriorityBand = 'recommend' | 'conditional' | 'backlog' | 'blocked';

/** §11.6 — any one of these blocks a recommendation regardless of score. */
export type HardStopCode =
  | 'no_accountable_owner'
  | 'no_daily_user'
  | 'no_measurable_outcome'
  | 'required_data_prohibited'
  | 'review_required_but_unavailable'
  | 'policy_prohibits_model_or_data_flow'
  | 'output_uncheckable_before_release'
  | 'integration_or_right_unavailable';

export interface HardStop {
  code: HardStopCode;
  /** Operator-facing explanation. Safe for the client report. */
  reason: string;
  /** What would have to become true for this stop to clear. */
  resolution: string;
}

export interface FactorDefinition {
  key: string;
  category: FactorCategory;
  /** Points contributed at a factor score of 5. Weights sum to exactly 100. */
  weight: number;
  label: string;
  /** §11.2 rubric anchors. The UI must show these next to every score (§11.1). */
  anchorZero: string;
  anchorFive: string;
}

/**
 * A scored factor as persisted. `rationale` and `sourceCitationIds` are what
 * make the score defensible — §11.1 requires the UI to show every factor,
 * value, evidence and rationale.
 */
export interface ScoredFactor {
  key: string;
  score: FactorScore;
  weight: number;
  rationale: string;
  sourceCitationIds: string[];
  overridden: boolean;
  /** §11.1: a strategist may override a factor ONLY with a written reason. */
  overrideReason?: string;
}

/** §11.4 — four components, each normalised 0–1. */
export interface ConfidenceInput {
  /** Share of required evidence actually present. */
  evidenceCoverage: number;
  /** Agreement between independent sources and between users. */
  sourceAgreement: number;
  /** How current the supporting evidence is. */
  evidenceRecency: number;
  /** Share of relevant claims a human reviewer has validated. */
  reviewerValidation: number;
}

export interface ConfidenceResult {
  score: number;
  multiplier: number;
  components: ConfidenceInput;
}

/** Mirrors the `opportunity_scores` row in §17.1. */
export interface OpportunityScore {
  factorVersion: string;
  factors: ScoredFactor[];
  rawScore: number;
  confidenceScore: number;
  confidenceMultiplier: number;
  priorityScore: number;
  priorityBand: PriorityBand;
  hardStops: HardStop[];
  calculatedAt: string;
}

export interface CalculateScoreInput {
  factors: ScoredFactor[];
  confidence: ConfidenceInput;
  hardStops?: HardStop[];
  /** Injected so results are reproducible in tests. Defaults to now. */
  calculatedAt?: Date;
}
