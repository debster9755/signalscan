import { describe, expect, it } from 'vitest';
import {
  CATEGORY_WEIGHTS,
  FACTORS,
  FACTOR_KEYS,
  FACTOR_SCALE,
  FACTOR_VERSION,
  TOTAL_WEIGHT,
  getFactor,
  validateFactorRegistry,
} from './factors';
import type { FactorDefinition } from './types';

describe('factor registry v1 (§11.2)', () => {
  it('defines exactly the sixteen factors in the specification', () => {
    expect(FACTORS).toHaveLength(16);
    expect(FACTOR_VERSION).toBe('v1');
  });

  it('sums to exactly 100 points', () => {
    expect(FACTORS.reduce((sum, f) => sum + f.weight, 0)).toBe(TOTAL_WEIGHT);
  });

  it.each([
    ['business_value', 40],
    ['feasibility', 30],
    ['risk_safety', 20],
    ['adoption_readiness', 10],
  ] as const)('category %s sums to %i points', (category, expected) => {
    const actual = FACTORS.filter((f) => f.category === category).reduce(
      (sum, f) => sum + f.weight,
      0,
    );
    expect(actual).toBe(expected);
    expect(CATEGORY_WEIGHTS[category]).toBe(expected);
  });

  it('carries the §11.2 weights for each individual factor', () => {
    const expected: Record<string, number> = {
      outcome_impact: 15,
      frequency_volume: 10,
      cycle_time_opportunity: 10,
      strategic_visibility: 5,
      input_availability: 10,
      task_repeatability: 8,
      workflow_fit: 6,
      clear_owner: 6,
      brand_claims_safety: 6,
      data_privacy_safety: 6,
      legal_regulatory_safety: 4,
      model_reliability: 4,
      executive_sponsor: 3,
      user_pull: 3,
      approval_path: 2,
      measurement_ability: 2,
    };
    for (const [key, weight] of Object.entries(expected)) {
      expect(getFactor(key)?.weight, key).toBe(weight);
    }
    expect(FACTOR_KEYS).toHaveLength(Object.keys(expected).length);
  });

  it('gives every factor both rubric anchors, because §11.1 requires showing them', () => {
    for (const factor of FACTORS) {
      expect(factor.anchorZero.length, factor.key).toBeGreaterThan(0);
      expect(factor.anchorFive.length, factor.key).toBeGreaterThan(0);
      expect(factor.label.length, factor.key).toBeGreaterThan(0);
    }
  });

  it('returns undefined for an unknown key rather than guessing', () => {
    expect(getFactor('does_not_exist')).toBeUndefined();
  });

  it('is frozen so a caller cannot mutate the rubric at runtime', () => {
    expect(Object.isFrozen(FACTORS)).toBe(true);
    expect(Object.isFrozen(CATEGORY_WEIGHTS)).toBe(true);
    expect(Object.isFrozen(FACTOR_SCALE)).toBe(true);
  });

  it('exposes the 0–5 scale the scorecard has to render (§14.3)', () => {
    expect(FACTOR_SCALE).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('validateFactorRegistry — the structural guard itself', () => {
  const factor = (over: Partial<FactorDefinition>): FactorDefinition => ({
    key: 'k',
    category: 'business_value',
    weight: 100,
    label: 'l',
    anchorZero: '0',
    anchorFive: '5',
    ...over,
  });

  it('accepts the live registry', () => {
    expect(() => validateFactorRegistry(FACTORS)).not.toThrow();
  });

  it('rejects a registry whose weights do not sum to 100', () => {
    expect(() => validateFactorRegistry([factor({ weight: 99 })])).toThrow(/sum to 99/);
  });

  it('rejects a registry that totals 100 but misallocates points across categories', () => {
    // 40 / 20 / 30 / 10 — sums to 100, so only the per-category check catches it.
    const misallocated: FactorDefinition[] = [
      factor({ key: 'a', category: 'business_value', weight: 40 }),
      factor({ key: 'b', category: 'feasibility', weight: 20 }),
      factor({ key: 'c', category: 'risk_safety', weight: 30 }),
      factor({ key: 'd', category: 'adoption_readiness', weight: 10 }),
    ];
    expect(() => validateFactorRegistry(misallocated)).toThrow(
      /category "feasibility" sums to 20, expected 30/,
    );
  });

  it('rejects duplicate factor keys', () => {
    const balanced: FactorDefinition[] = [
      factor({ key: 'dupe', category: 'business_value', weight: 20 }),
      factor({ key: 'dupe', category: 'business_value', weight: 20 }),
      factor({ key: 'c', category: 'feasibility', weight: 30 }),
      factor({ key: 'd', category: 'risk_safety', weight: 20 }),
      factor({ key: 'e', category: 'adoption_readiness', weight: 10 }),
    ];
    expect(() => validateFactorRegistry(balanced)).toThrow(/duplicate factor keys/);
  });

  it('names the version it was given in the failure message', () => {
    expect(() => validateFactorRegistry([factor({ weight: 1 })], 'v9')).toThrow(
      /Factor registry v9 is malformed/,
    );
  });
});
