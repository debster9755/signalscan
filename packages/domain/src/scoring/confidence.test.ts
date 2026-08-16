import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_MULTIPLIER_FLOOR,
  CONFIDENCE_MULTIPLIER_RANGE,
  CONFIDENCE_WEIGHTS,
  calculateConfidence,
  roundTo,
} from './confidence.js';
import type { ConfidenceInput } from './types.js';

const evenlySplit = (value: number): ConfidenceInput => ({
  evidenceCoverage: value,
  sourceAgreement: value,
  evidenceRecency: value,
  reviewerValidation: value,
});

describe('confidence model (§11.4)', () => {
  it('weights the four components 40 / 25 / 20 / 15', () => {
    expect(CONFIDENCE_WEIGHTS.evidenceCoverage).toBe(0.4);
    expect(CONFIDENCE_WEIGHTS.sourceAgreement).toBe(0.25);
    expect(CONFIDENCE_WEIGHTS.evidenceRecency).toBe(0.2);
    expect(CONFIDENCE_WEIGHTS.reviewerValidation).toBe(0.15);
    expect(Object.values(CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('scores 1.0 and multiplies by 1.0 when every component is complete', () => {
    const result = calculateConfidence(evenlySplit(1));
    expect(result.score).toBe(1);
    expect(result.multiplier).toBe(1);
  });

  it('floors the multiplier at 0.60 when there is no supporting evidence at all', () => {
    const result = calculateConfidence(evenlySplit(0));
    expect(result.score).toBe(0);
    // §11.4: confidence dampens a score, it never zeroes one. Blocking is the
    // job of hard stops.
    expect(result.multiplier).toBe(CONFIDENCE_MULTIPLIER_FLOOR);
  });

  it('applies the documented weighting to mixed components', () => {
    // 0.85*0.40 + 0.60*0.25 + 0.40*0.20 + 0.20*0.15 = 0.34 + 0.15 + 0.08 + 0.03
    const result = calculateConfidence({
      evidenceCoverage: 0.85,
      sourceAgreement: 0.6,
      evidenceRecency: 0.4,
      reviewerValidation: 0.2,
    });
    expect(result.score).toBe(0.6);
    expect(result.multiplier).toBe(0.84);
  });

  it('keeps the multiplier inside [0.60, 1.00] across the whole input range', () => {
    for (let i = 0; i <= 100; i += 1) {
      const { multiplier } = calculateConfidence(evenlySplit(i / 100));
      expect(multiplier).toBeGreaterThanOrEqual(CONFIDENCE_MULTIPLIER_FLOOR);
      expect(multiplier).toBeLessThanOrEqual(
        CONFIDENCE_MULTIPLIER_FLOOR + CONFIDENCE_MULTIPLIER_RANGE,
      );
    }
  });

  it('returns a copy of the components so callers cannot mutate the result', () => {
    const input = evenlySplit(0.5);
    const result = calculateConfidence(input);
    result.components.evidenceCoverage = 0.9;
    expect(input.evidenceCoverage).toBe(0.5);
  });

  it.each([
    ['evidenceCoverage', { evidenceCoverage: 1.01 }],
    ['sourceAgreement', { sourceAgreement: -0.01 }],
    ['evidenceRecency', { evidenceRecency: 2 }],
    ['reviewerValidation', { reviewerValidation: -1 }],
  ])('rejects %s outside 0..1', (_name, override) => {
    expect(() => calculateConfidence({ ...evenlySplit(0.5), ...override })).toThrow(RangeError);
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('rejects a non-finite component (%s)', (_name, value) => {
    expect(() => calculateConfidence({ ...evenlySplit(0.5), evidenceCoverage: value })).toThrow(
      /finite number/,
    );
  });

  it('names the offending component so the operator can fix the right input', () => {
    expect(() => calculateConfidence({ ...evenlySplit(0.5), evidenceRecency: 3 })).toThrow(
      /Evidence recency/,
    );
  });
});

describe('roundTo', () => {
  it('rounds to the requested precision', () => {
    expect(roundTo(1.23456, 2)).toBe(1.23);
    expect(roundTo(1.23556, 2)).toBe(1.24);
    expect(roundTo(0.60000000000000009, 4)).toBe(0.6);
  });

  it('handles zero without producing negative zero', () => {
    expect(Object.is(roundTo(0, 2), 0)).toBe(true);
  });

  it('rounds negatives away from zero symmetrically', () => {
    expect(roundTo(-1.235, 2)).toBe(-1.24);
    expect(roundTo(-1.234, 2)).toBe(-1.23);
  });

  it('defeats binary representation error that would otherwise shift a band', () => {
    // The literal reason this helper exists: 0.145 * 1000 is 144.99999999999997.
    expect(roundTo(0.145, 2)).toBe(0.15);
  });
});
