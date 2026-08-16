import { describe, expect, it } from 'vitest';
import { FACTORS, FACTOR_VERSION } from './factors.js';
import {
  BAND_THRESHOLDS,
  MAX_RAW_SCORE,
  ScoringError,
  assignBand,
  calculateOpportunityScore,
  calculateRawScore,
  rankOpportunities,
  validateFactors,
} from './score.js';
import type {
  ConfidenceInput,
  FactorScore,
  HardStop,
  OpportunityScore,
  PriorityBand,
  ScoredFactor,
} from './types.js';

const FULL_CONFIDENCE: ConfidenceInput = {
  evidenceCoverage: 1,
  sourceAgreement: 1,
  evidenceRecency: 1,
  reviewerValidation: 1,
};

function factorsAt(
  score: FactorScore,
  overrides: Record<string, Partial<ScoredFactor>> = {},
): ScoredFactor[] {
  return FACTORS.map((definition) => ({
    key: definition.key,
    score,
    weight: definition.weight,
    rationale: `Anchored against: ${definition.anchorFive}`,
    sourceCitationIds: [],
    overridden: false,
    ...overrides[definition.key],
  }));
}

const BLOCKER: HardStop = {
  code: 'no_daily_user',
  reason: 'No hands-on daily user is named.',
  resolution: 'Name the person or role who will use this workflow day to day.',
};

describe('validateFactors', () => {
  it('accepts a complete, well-formed factor set', () => {
    expect(() => validateFactors(factorsAt(3))).not.toThrow();
  });

  it('rejects a factor key that is not in the registry', () => {
    const factors = [...factorsAt(3), {
      key: 'invented_factor',
      score: 5 as FactorScore,
      weight: 10,
      rationale: '',
      sourceCitationIds: [],
      overridden: false,
    }];
    expect(() => validateFactors(factors)).toThrow(/Unknown factor "invented_factor"/);
  });

  it('rejects a duplicated factor', () => {
    const factors = factorsAt(3);
    factors.push({ ...factors[0]! });
    expect(() => validateFactors(factors)).toThrow(/appears more than once/);
  });

  it('rejects a caller-supplied weight that disagrees with the registry', () => {
    // Otherwise a client could inflate its own score by shipping heavier weights.
    const factors = factorsAt(3, { outcome_impact: { weight: 40 } });
    expect(() => validateFactors(factors)).toThrow(/carries weight 40 but registry v1 defines 15/);
  });

  it('rejects an incomplete score and names what is missing', () => {
    const factors = factorsAt(3).filter((f) => f.key !== 'user_pull');
    expect(() => validateFactors(factors)).toThrow(/missing factor\(s\) user_pull/);
  });

  it.each([
    ['a fractional score', 2.5],
    ['a negative score', -1],
    ['a score above the rubric ceiling', 6],
  ])('rejects %s', (_label, score) => {
    const factors = factorsAt(3, { workflow_fit: { score: score as FactorScore } });
    expect(() => validateFactors(factors)).toThrow(ScoringError);
  });

  describe('§11.1 — an override requires a written reason', () => {
    it('rejects an override with no reason at all', () => {
      const factors = factorsAt(3, { clear_owner: { overridden: true } });
      expect(() => validateFactors(factors)).toThrow(/carries no override reason/);
    });

    it('rejects an override whose reason is only whitespace', () => {
      const factors = factorsAt(3, { clear_owner: { overridden: true, overrideReason: '  ' } });
      expect(() => validateFactors(factors)).toThrow(/carries no override reason/);
    });

    it('accepts an override with a real reason', () => {
      const factors = factorsAt(3, {
        clear_owner: {
          overridden: true,
          overrideReason: 'Operator confirmed a named owner on the Day 2 walkthrough.',
        },
      });
      expect(() => validateFactors(factors)).not.toThrow();
    });
  });
});

describe('raw score (§11.3)', () => {
  it.each([
    [0, 0],
    [1, 20],
    [2, 40],
    [3, 60],
    [4, 80],
    [5, 100],
  ])('scores every factor at %i for a raw score of %i', (score, expected) => {
    expect(calculateRawScore(factorsAt(score as FactorScore))).toBe(expected);
  });

  it('caps at 100 when every factor is at the top anchor', () => {
    expect(calculateRawScore(factorsAt(5))).toBe(MAX_RAW_SCORE);
  });

  it('weights a heavy factor more than a light one', () => {
    // outcome_impact is 15 points; approval_path is 2.
    const heavy = calculateRawScore(factorsAt(0, { outcome_impact: { score: 5 } }));
    const light = calculateRawScore(factorsAt(0, { approval_path: { score: 5 } }));
    expect(heavy).toBe(15);
    expect(light).toBe(2);
  });

  it('is independent of factor ordering — the same inputs always give the same score', () => {
    const ordered = factorsAt(4, { outcome_impact: { score: 2 }, user_pull: { score: 5 } });
    const shuffled = [...ordered].reverse();
    expect(calculateRawScore(shuffled)).toBe(calculateRawScore(ordered));
  });

  it('produces exact decimals rather than float drift', () => {
    // 15*5 + 10*3 + everything-else*1 — the kind of mix that accumulates error
    // if you sum sixteen (score/5)*weight floats instead of dividing once.
    const factors = factorsAt(1, { outcome_impact: { score: 5 }, frequency_volume: { score: 3 } });
    // (75 + 30 + 75) / 5 = 36
    expect(calculateRawScore(factors)).toBe(36);
    expect(Number.isInteger(calculateRawScore(factors) * 100)).toBe(true);
  });
});

describe('priority bands (§11.5)', () => {
  it.each([
    [100, 'recommend'],
    [75, 'recommend'],
    [74.99, 'conditional'],
    [60, 'conditional'],
    [59.99, 'backlog'],
    [0, 'backlog'],
  ])('maps a priority score of %s to %s', (score, band) => {
    expect(assignBand(score as number, false)).toBe(band as PriorityBand);
  });

  it('uses the documented boundaries', () => {
    expect(BAND_THRESHOLDS.recommend).toBe(75);
    expect(BAND_THRESHOLDS.conditional).toBe(60);
  });

  it('blocks a perfect score when a hard stop exists', () => {
    // §11.5: "Any score with hard stop → blocked". This is the single most
    // important line in the scoring model.
    expect(assignBand(100, true)).toBe('blocked');
  });

  it('blocks a zero score with a hard stop too', () => {
    expect(assignBand(0, true)).toBe('blocked');
  });
});

describe('calculateOpportunityScore', () => {
  it('returns raw, confidence and adjusted priority as three separate values (§11.4)', () => {
    const result = calculateOpportunityScore({
      factors: factorsAt(5),
      confidence: {
        evidenceCoverage: 0.85,
        sourceAgreement: 0.6,
        evidenceRecency: 0.4,
        reviewerValidation: 0.2,
      },
      calculatedAt: new Date('2026-08-16T00:00:00.000Z'),
    });

    expect(result.rawScore).toBe(100);
    expect(result.confidenceScore).toBe(0.6);
    expect(result.confidenceMultiplier).toBe(0.84);
    expect(result.priorityScore).toBe(84);
    expect(result.priorityBand).toBe('recommend');
    expect(result.factorVersion).toBe(FACTOR_VERSION);
    expect(result.calculatedAt).toBe('2026-08-16T00:00:00.000Z');
  });

  it('drops a strong workflow out of "recommend" when the evidence is thin', () => {
    const thin = calculateOpportunityScore({
      factors: factorsAt(4), // raw 80 — comfortably recommendable on its own
      confidence: {
        evidenceCoverage: 0,
        sourceAgreement: 0,
        evidenceRecency: 0,
        reviewerValidation: 0,
      },
    });
    expect(thin.rawScore).toBe(80);
    expect(thin.confidenceMultiplier).toBe(0.6);
    expect(thin.priorityScore).toBe(48);
    expect(thin.priorityBand).toBe('backlog');
  });

  it('blocks regardless of score when a hard stop is present', () => {
    const result = calculateOpportunityScore({
      factors: factorsAt(5),
      confidence: FULL_CONFIDENCE,
      hardStops: [BLOCKER],
    });
    expect(result.priorityScore).toBe(100);
    expect(result.priorityBand).toBe('blocked');
    expect(result.hardStops).toHaveLength(1);
  });

  it('defaults to an empty hard-stop list when none is supplied', () => {
    const result = calculateOpportunityScore({
      factors: factorsAt(5),
      confidence: FULL_CONFIDENCE,
    });
    expect(result.hardStops).toEqual([]);
    expect(result.priorityBand).toBe('recommend');
  });

  it('stamps the current time when no clock is injected', () => {
    const before = Date.now();
    const result = calculateOpportunityScore({
      factors: factorsAt(3),
      confidence: FULL_CONFIDENCE,
    });
    const stamped = Date.parse(result.calculatedAt);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  it('copies factors and stops so a caller cannot mutate a persisted score', () => {
    const stops = [{ ...BLOCKER }];
    const result = calculateOpportunityScore({
      factors: factorsAt(3),
      confidence: FULL_CONFIDENCE,
      hardStops: stops,
    });
    result.factors[0]!.score = 5;
    result.hardStops[0]!.reason = 'tampered';
    expect(stops[0]!.reason).toBe(BLOCKER.reason);
  });

  it('is reproducible — §32.1 requires the same saved factors to give the same score', () => {
    const input = {
      factors: factorsAt(3, { outcome_impact: { score: 5 }, model_reliability: { score: 1 } }),
      confidence: {
        evidenceCoverage: 0.73,
        sourceAgreement: 0.41,
        evidenceRecency: 0.9,
        reviewerValidation: 0.12,
      },
      calculatedAt: new Date('2026-08-16T00:00:00.000Z'),
    };
    const first = calculateOpportunityScore(input);
    const second = calculateOpportunityScore(input);
    expect(second).toEqual(first);
  });

  it('rejects an invalid factor set instead of scoring it', () => {
    expect(() =>
      calculateOpportunityScore({
        factors: factorsAt(3).slice(0, 4),
        confidence: FULL_CONFIDENCE,
      }),
    ).toThrow(ScoringError);
  });
});

describe('rankOpportunities', () => {
  function scored(
    id: string,
    priorityScore: number,
    band: PriorityBand,
    extra: { rawScore?: number; confidenceScore?: number } = {},
  ): { id: string; score: OpportunityScore } {
    return {
      id,
      score: {
        factorVersion: FACTOR_VERSION,
        factors: [],
        rawScore: extra.rawScore ?? priorityScore,
        confidenceScore: extra.confidenceScore ?? 1,
        confidenceMultiplier: 1,
        priorityScore,
        priorityBand: band,
        hardStops: band === 'blocked' ? [BLOCKER] : [],
        calculatedAt: '2026-08-16T00:00:00.000Z',
      },
    };
  }

  it('orders by priority score, highest first', () => {
    const ranked = rankOpportunities([
      scored('c', 40, 'backlog'),
      scored('a', 90, 'recommend'),
      scored('b', 65, 'conditional'),
    ]);
    expect(ranked.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('sinks blocked opportunities below everything, however high they scored', () => {
    // Showing a blocked item at the top of a ranked list invites exactly the
    // mistake hard stops exist to prevent.
    const ranked = rankOpportunities([
      scored('blocked-but-brilliant', 98, 'blocked'),
      scored('modest', 42, 'backlog'),
    ]);
    expect(ranked.map((o) => o.id)).toEqual(['modest', 'blocked-but-brilliant']);
  });

  it('sorts blocked below unblocked regardless of input order', () => {
    const ranked = rankOpportunities([
      scored('modest', 42, 'backlog'),
      scored('blocked-but-brilliant', 98, 'blocked'),
    ]);
    expect(ranked.map((o) => o.id)).toEqual(['modest', 'blocked-but-brilliant']);
  });

  it('breaks a priority tie on raw score', () => {
    const ranked = rankOpportunities([
      scored('lower-raw', 60, 'conditional', { rawScore: 70 }),
      scored('higher-raw', 60, 'conditional', { rawScore: 95 }),
    ]);
    expect(ranked.map((o) => o.id)).toEqual(['higher-raw', 'lower-raw']);
  });

  it('breaks a raw-score tie on confidence', () => {
    const ranked = rankOpportunities([
      scored('less-sure', 60, 'conditional', { rawScore: 60, confidenceScore: 0.3 }),
      scored('more-sure', 60, 'conditional', { rawScore: 60, confidenceScore: 0.9 }),
    ]);
    expect(ranked.map((o) => o.id)).toEqual(['more-sure', 'less-sure']);
  });

  it('falls back to id so the order is stable across runs', () => {
    const ranked = rankOpportunities([
      scored('zebra', 60, 'conditional'),
      scored('alpha', 60, 'conditional'),
    ]);
    expect(ranked.map((o) => o.id)).toEqual(['alpha', 'zebra']);
  });

  it('does not mutate the input array', () => {
    const input = [scored('b', 10, 'backlog'), scored('a', 90, 'recommend')];
    rankOpportunities(input);
    expect(input.map((o) => o.id)).toEqual(['b', 'a']);
  });

  it('handles an empty portfolio', () => {
    expect(rankOpportunities([])).toEqual([]);
  });
});
