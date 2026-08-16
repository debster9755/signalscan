import type { ConfidenceInput, ConfidenceResult } from './types.js';

/**
 * Confidence model — PRD §11.4.
 *
 * Confidence is deliberately separate from attractiveness. A workflow can be
 * genuinely valuable and still be a bad first pilot because we barely know
 * anything about it; the multiplier is what stops thin evidence from producing
 * a confident-looking recommendation.
 */

/** §11.4 weights. Must sum to 1. */
export const CONFIDENCE_WEIGHTS = Object.freeze({
  evidenceCoverage: 0.4,
  sourceAgreement: 0.25,
  evidenceRecency: 0.2,
  reviewerValidation: 0.15,
});

/**
 * §11.4: `confidence_multiplier = 0.60 + (confidence_score * 0.40)`.
 *
 * The floor of 0.60 is the important part — zero evidence still leaves 60% of
 * the raw score, so confidence dampens a recommendation rather than erasing it.
 * Blocking is the job of hard stops, not of confidence.
 */
export const CONFIDENCE_MULTIPLIER_FLOOR = 0.6;
export const CONFIDENCE_MULTIPLIER_RANGE = 0.4;

/** Persisted as numeric(5,4) — see `opportunity_scores` in §17.1. */
const CONFIDENCE_DECIMAL_PLACES = 4;

const COMPONENT_LABELS: Record<keyof ConfidenceInput, string> = {
  evidenceCoverage: 'Required evidence coverage',
  sourceAgreement: 'Agreement between sources / users',
  evidenceRecency: 'Evidence recency',
  reviewerValidation: 'Human reviewer validation',
};

function assertUnitInterval(value: number, component: keyof ConfidenceInput): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${COMPONENT_LABELS[component]} must be a finite number, got ${value}.`);
  }
  if (value < 0 || value > 1) {
    throw new RangeError(
      `${COMPONENT_LABELS[component]} must be between 0 and 1 inclusive, got ${value}.`,
    );
  }
}

/**
 * Rounds half away from zero at a fixed precision so two runs on two machines
 * agree. All inputs here are non-negative, so the sign handling is belt-and-braces.
 */
export function roundTo(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  const scaled = value * factor;
  // Nudge by an epsilon proportional to magnitude to defeat representations
  // like 0.145 * 1000 === 144.99999999999997.
  const corrected = scaled + Math.sign(scaled) * Number.EPSILON * Math.abs(scaled);
  return Math.round(corrected) / factor;
}

export function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
  assertUnitInterval(input.evidenceCoverage, 'evidenceCoverage');
  assertUnitInterval(input.sourceAgreement, 'sourceAgreement');
  assertUnitInterval(input.evidenceRecency, 'evidenceRecency');
  assertUnitInterval(input.reviewerValidation, 'reviewerValidation');

  const weighted =
    input.evidenceCoverage * CONFIDENCE_WEIGHTS.evidenceCoverage +
    input.sourceAgreement * CONFIDENCE_WEIGHTS.sourceAgreement +
    input.evidenceRecency * CONFIDENCE_WEIGHTS.evidenceRecency +
    input.reviewerValidation * CONFIDENCE_WEIGHTS.reviewerValidation;

  const score = roundTo(weighted, CONFIDENCE_DECIMAL_PLACES);
  const multiplier = roundTo(
    CONFIDENCE_MULTIPLIER_FLOOR + score * CONFIDENCE_MULTIPLIER_RANGE,
    CONFIDENCE_DECIMAL_PLACES,
  );

  return { score, multiplier, components: { ...input } };
}
