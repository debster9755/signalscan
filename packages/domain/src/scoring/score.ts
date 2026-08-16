import { calculateConfidence, roundTo } from './confidence.js';
import { FACTOR_KEYS, FACTOR_VERSION, getFactor, TOTAL_WEIGHT } from './factors.js';
import type {
  CalculateScoreInput,
  FactorScore,
  OpportunityScore,
  PriorityBand,
  ScoredFactor,
} from './types.js';

/**
 * Deterministic opportunity scoring — PRD §11.3.
 *
 *   weighted_factor_points = (factor_score / 5) * factor_weight
 *   raw_score              = sum(all weighted_factor_points)      // 0–100
 *   priority_score         = raw_score * confidence_multiplier
 *
 * `raw_score` is computed in integer space and divided once, at the end. Summing
 * sixteen `(score / 5) * weight` floats and comparing the total to a band
 * boundary is how you get an opportunity that scores 74.99999999999999 and lands
 * in `conditional` on one machine and `recommend` on another. §32.1 requires
 * scores to be reproducible, so the arithmetic has to earn that.
 */

/** Persisted as numeric(5,2) — see `opportunity_scores` in §17.1. */
const SCORE_DECIMAL_PLACES = 2;

/** §11.5 band boundaries, inclusive lower bounds. */
export const BAND_THRESHOLDS = Object.freeze({
  recommend: 75,
  conditional: 60,
});

export class ScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoringError';
  }
}

function assertValidFactorScore(value: number, key: string): asserts value is FactorScore {
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    throw new ScoringError(
      `Factor "${key}" has score ${value}; expected an integer between 0 and 5 (§11.1).`,
    );
  }
}

/**
 * Rejects anything that would make the score unreproducible or unauditable:
 * unknown factors, missing factors, duplicates, tampered weights, out-of-range
 * scores, and — per §11.1 — an override without a written reason.
 */
export function validateFactors(factors: ScoredFactor[]): void {
  const seen = new Set<string>();

  for (const factor of factors) {
    const definition = getFactor(factor.key);
    if (!definition) {
      throw new ScoringError(
        `Unknown factor "${factor.key}" is not in registry ${FACTOR_VERSION}.`,
      );
    }
    if (seen.has(factor.key)) {
      throw new ScoringError(`Factor "${factor.key}" appears more than once.`);
    }
    seen.add(factor.key);

    assertValidFactorScore(factor.score, factor.key);

    if (factor.weight !== definition.weight) {
      throw new ScoringError(
        `Factor "${factor.key}" carries weight ${factor.weight} but registry ${FACTOR_VERSION} defines ${definition.weight}. ` +
          'Weights come from the registry, never from the caller.',
      );
    }

    // §11.1: "A strategist may override a factor only with a written reason."
    if (
      factor.overridden &&
      (!factor.overrideReason || factor.overrideReason.trim().length === 0)
    ) {
      throw new ScoringError(
        `Factor "${factor.key}" is marked overridden but carries no override reason (§11.1).`,
      );
    }
  }

  const missing = FACTOR_KEYS.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    throw new ScoringError(
      `Score is incomplete: missing factor(s) ${missing.join(', ')}. All ${FACTOR_KEYS.length} factors must be scored.`,
    );
  }
}

/**
 * Raw attractiveness, 0–100. Exact: the numerator is an integer sum, so the only
 * division happens once.
 */
export function calculateRawScore(factors: ScoredFactor[]): number {
  validateFactors(factors);
  const weightedNumerator = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
  return weightedNumerator / 5;
}

/**
 * §11.5. A hard stop wins over any score — checked first, deliberately, so no
 * future edit can accidentally let a high scorer through a blocker.
 */
export function assignBand(priorityScore: number, hasHardStop: boolean): PriorityBand {
  if (hasHardStop) return 'blocked';
  if (priorityScore >= BAND_THRESHOLDS.recommend) return 'recommend';
  if (priorityScore >= BAND_THRESHOLDS.conditional) return 'conditional';
  return 'backlog';
}

/**
 * The single entry point. Everything the UI shows — raw score, confidence
 * percentage, confidence-adjusted priority (§11.4) — comes from here, and
 * nothing here consults a model (§20.2).
 */
export function calculateOpportunityScore(input: CalculateScoreInput): OpportunityScore {
  const rawScore = roundTo(calculateRawScore(input.factors), SCORE_DECIMAL_PLACES);
  const confidence = calculateConfidence(input.confidence);
  const hardStops = input.hardStops ?? [];

  const priorityScore = roundTo(rawScore * confidence.multiplier, SCORE_DECIMAL_PLACES);
  const priorityBand = assignBand(priorityScore, hardStops.length > 0);

  return {
    factorVersion: FACTOR_VERSION,
    factors: input.factors.map((f) => ({ ...f })),
    rawScore,
    confidenceScore: confidence.score,
    confidenceMultiplier: confidence.multiplier,
    priorityScore,
    priorityBand,
    hardStops: hardStops.map((s) => ({ ...s })),
    calculatedAt: (input.calculatedAt ?? new Date()).toISOString(),
  };
}

/**
 * Ranks a portfolio for the §14.3 opportunity scorecard.
 *
 * Blocked opportunities sort last regardless of score — showing a blocked item
 * at the top of a ranked list invites exactly the mistake hard stops exist to
 * prevent. Ties break on raw score, then confidence, then id, so the order is
 * stable across runs.
 */
export function rankOpportunities<T extends { id: string; score: OpportunityScore }>(
  opportunities: T[],
): T[] {
  return [...opportunities].sort((a, b) => {
    const aBlocked = a.score.priorityBand === 'blocked';
    const bBlocked = b.score.priorityBand === 'blocked';
    if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;

    if (b.score.priorityScore !== a.score.priorityScore) {
      return b.score.priorityScore - a.score.priorityScore;
    }
    if (b.score.rawScore !== a.score.rawScore) {
      return b.score.rawScore - a.score.rawScore;
    }
    if (b.score.confidenceScore !== a.score.confidenceScore) {
      return b.score.confidenceScore - a.score.confidenceScore;
    }
    return a.id.localeCompare(b.id);
  });
}

export const MAX_RAW_SCORE = TOTAL_WEIGHT;
