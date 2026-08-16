import { describe, expect, it } from 'vitest';
import {
  BusinessCaseError,
  DEFAULT_CURRENCY,
  annualHoursSaved,
  annualLabourValue,
  annualReworkValue,
  calculateScenario,
  describeSavings,
  paybackMonths,
  resolveCurrency,
} from './calculate';
import type { ScenarioInputs } from './types';

/** A fully-specified workflow: 100 items/month, 30 minutes saved on each. */
function completeInputs(overrides: Partial<ScenarioInputs> = {}): ScenarioInputs {
  return {
    monthlyWorkflowVolume: 100,
    minutesSavedPerItem: 30,
    loadedHourlyCost: 1500,
    monthlyReworkEvents: 10,
    costPerReworkEvent: 5000,
    expectedReworkReduction: 0.5,
    evidenceBackedRevenueUpside: null,
    revenueCausalLink: 'moderate',
    pilotCost: 500_000,
    annualRunCost: 200_000,
    ...overrides,
  };
}

describe('currency handling (§12.2, §23.5)', () => {
  it('defaults to INR only when the client has not specified one', () => {
    expect(resolveCurrency(null)).toBe(DEFAULT_CURRENCY);
    expect(resolveCurrency(undefined)).toBe(DEFAULT_CURRENCY);
    expect(resolveCurrency('   ')).toBe(DEFAULT_CURRENCY);
  });

  it('honours an explicitly supplied currency over the default', () => {
    expect(resolveCurrency('GBP')).toBe('GBP');
    expect(resolveCurrency('usd')).toBe('USD');
  });

  it('refuses a symbol or malformed code rather than silently falling back', () => {
    // Quietly switching a client's currency is worse than refusing to render.
    expect(() => resolveCurrency('₹')).toThrow(BusinessCaseError);
    expect(() => resolveCurrency('RUPEES')).toThrow(/ISO 4217/);
  });
});

describe('§12.2 formulas', () => {
  it('computes annual hours saved', () => {
    // 100 × 30 ÷ 60 × 12
    expect(annualHoursSaved(100, 30)).toBe(600);
  });

  it('computes annual labour value', () => {
    expect(annualLabourValue(600, 1500)).toBe(900_000);
  });

  it('computes annual rework value', () => {
    // 10 × 5000 × 0.5 × 12
    expect(annualReworkValue(10, 5000, 0.5)).toBe(300_000);
  });

  it('returns zero value for a zero-volume workflow rather than erroring', () => {
    expect(annualHoursSaved(0, 30)).toBe(0);
    expect(annualReworkValue(0, 5000, 0.5)).toBe(0);
  });

  it.each([
    ['negative volume', () => annualHoursSaved(-1, 30)],
    ['negative minutes', () => annualHoursSaved(100, -30)],
    ['negative hourly cost', () => annualLabourValue(600, -1)],
    ['negative hours', () => annualLabourValue(-1, 1500)],
    ['negative rework events', () => annualReworkValue(-1, 5000, 0.5)],
    ['negative rework cost', () => annualReworkValue(10, -1, 0.5)],
    ['non-finite input', () => annualHoursSaved(Number.NaN, 30)],
  ])('rejects %s', (_label, fn) => {
    expect(fn).toThrow(BusinessCaseError);
  });

  it.each([-0.1, 1.1])('rejects a rework reduction of %s (must be 0..1)', (reduction) => {
    expect(() => annualReworkValue(10, 5000, reduction)).toThrow(/between 0 and 1/);
  });
});

describe('payback (§12.2)', () => {
  it('computes payback in months when there is positive monthly value', () => {
    // 500,000 ÷ ((1,200,000 − 200,000) ÷ 12)
    expect(paybackMonths(500_000, 1_200_000, 200_000)).toBe(6);
  });

  it('returns null — not Infinity — when monthly value is zero', () => {
    // §12.2: "Do not show payback if monthly value is zero or negative."
    expect(paybackMonths(500_000, 200_000, 200_000)).toBeNull();
  });

  it('returns null when running costs exceed the value created', () => {
    expect(paybackMonths(500_000, 100_000, 200_000)).toBeNull();
  });

  it('rejects a negative pilot cost', () => {
    expect(() => paybackMonths(-1, 1_200_000, 200_000)).toThrow(BusinessCaseError);
  });
});

describe('calculateScenario', () => {
  it('produces a complete scenario when every input is present', () => {
    const result = calculateScenario('base', completeInputs(), 'INR');

    expect(result.scenario).toBe('base');
    expect(result.currency).toBe('INR');
    expect(result.annualHoursSaved).toBe(600);
    expect(result.annualLabourValue).toBe(900_000);
    expect(result.annualReworkValue).toBe(300_000);
    expect(result.annualGrossValue).toBe(1_200_000);
    expect(result.yearOneNetValue).toBe(500_000);
    expect(result.paybackMonths).toBe(6);
    expect(result.complete).toBe(true);
    expect(result.missingInputs).toEqual([]);
  });

  it('leaves an unknown cost unknown instead of estimating it (§12.1)', () => {
    const result = calculateScenario('base', completeInputs({ loadedHourlyCost: null }), 'INR');

    expect(result.annualHoursSaved).toBe(600); // still derivable
    expect(result.annualLabourValue).toBeNull(); // not invented
    expect(result.complete).toBe(false);
    expect(result.missingInputs).toContain('loadedHourlyCost');
    expect(result.notes.join(' ')).toMatch(/never estimated/);
  });

  it('still reports rework value when only the labour inputs are missing', () => {
    const result = calculateScenario(
      'base',
      completeInputs({ monthlyWorkflowVolume: null, loadedHourlyCost: null }),
      'INR',
    );
    expect(result.annualLabourValue).toBeNull();
    expect(result.annualReworkValue).toBe(300_000);
    expect(result.annualGrossValue).toBe(300_000);
  });

  it('returns nulls throughout when nothing at all is known', () => {
    const empty: ScenarioInputs = {
      monthlyWorkflowVolume: null,
      minutesSavedPerItem: null,
      loadedHourlyCost: null,
      monthlyReworkEvents: null,
      costPerReworkEvent: null,
      expectedReworkReduction: null,
      evidenceBackedRevenueUpside: null,
      revenueCausalLink: 'weak',
      pilotCost: null,
      annualRunCost: null,
    };
    const result = calculateScenario('conservative', empty, 'INR');
    expect(result.annualGrossValue).toBeNull();
    expect(result.yearOneNetValue).toBeNull();
    expect(result.paybackMonths).toBeNull();
    expect(result.missingInputs).toHaveLength(8);
  });

  describe('revenue upside (§12.2)', () => {
    it('includes upside in the headline when the causal link is not weak', () => {
      const result = calculateScenario(
        'upside',
        completeInputs({ evidenceBackedRevenueUpside: 400_000, revenueCausalLink: 'strong' }),
        'INR',
      );
      expect(result.annualRevenueUpside).toBe(400_000);
      expect(result.separatedRevenueUpside).toBeNull();
      expect(result.annualGrossValue).toBe(1_600_000);
    });

    it('separates upside and excludes it from net value when the link is weak', () => {
      const result = calculateScenario(
        'upside',
        completeInputs({ evidenceBackedRevenueUpside: 400_000, revenueCausalLink: 'weak' }),
        'INR',
      );
      expect(result.annualRevenueUpside).toBeNull();
      expect(result.separatedRevenueUpside).toBe(400_000);
      expect(result.annualGrossValue).toBe(1_200_000);
      expect(result.yearOneNetValue).toBe(500_000);
      expect(result.notes.join(' ')).toMatch(/reported separately/);
    });
  });

  it('explains itself when payback cannot be shown', () => {
    const result = calculateScenario(
      'conservative',
      completeInputs({ annualRunCost: 5_000_000 }),
      'INR',
    );
    expect(result.paybackMonths).toBeNull();
    expect(result.yearOneNetValue).toBeLessThan(0);
    expect(result.notes.join(' ')).toMatch(/does not produce positive monthly value/);
  });
});

describe('describeSavings (§12.2)', () => {
  it('describes savings as released capacity by default', () => {
    const text = describeSavings(600, false);
    expect(text).toMatch(/capacity released back to the team/);
    expect(text).not.toMatch(/headcount|reduction/i);
  });

  it('only mentions capacity reduction once the client has confirmed that framing', () => {
    expect(describeSavings(600, true)).toMatch(/client has confirmed/);
  });
});
