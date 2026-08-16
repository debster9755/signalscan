import { describe, expect, it } from 'vitest';
import { detectHardStops, type HardStopContext } from './hard-stops.js';
import type { HardStopCode } from './types.js';

/** A workflow that clears all eight §11.6 conditions. */
function cleanContext(overrides: Partial<HardStopContext> = {}): HardStopContext {
  return {
    accountableOwnerRole: 'Campaign Operations Lead',
    dailyUserRole: 'Content Producer',
    measurableOutcome: { kpi: 'Brief-to-launch cycle time', proxyAccepted: false },
    requiredSystems: [
      { systemName: 'Asset DAM', status: 'available' },
      { systemName: 'Campaign Planner', status: 'available_with_approval' },
    ],
    review: {
      brandReviewRequired: true,
      brandReviewerAvailable: true,
      legalReviewRequired: false,
      legalReviewerAvailable: false,
    },
    policy: { modelAndDataFlowPermitted: true, restrictionNote: null },
    output: { highImpact: true, humanCheckBeforeRelease: true },
    dependencies: [{ name: 'DAM read API', clientCanProvide: true }],
    ...overrides,
  };
}

const codes = (context: HardStopContext): HardStopCode[] =>
  detectHardStops(context).map((s) => s.code);

describe('hard stops (§11.6)', () => {
  it('returns nothing for a workflow that clears every condition', () => {
    expect(detectHardStops(cleanContext())).toEqual([]);
  });

  describe('accountable owner', () => {
    it('fires when the owner is null', () => {
      expect(codes(cleanContext({ accountableOwnerRole: null }))).toContain('no_accountable_owner');
    });

    it('fires when the owner is only whitespace, not just when it is missing', () => {
      expect(codes(cleanContext({ accountableOwnerRole: '   ' }))).toContain(
        'no_accountable_owner',
      );
    });
  });

  describe('daily user', () => {
    it('fires when no daily user is named', () => {
      expect(codes(cleanContext({ dailyUserRole: null }))).toContain('no_daily_user');
    });

    it('fires on a whitespace-only daily user', () => {
      expect(codes(cleanContext({ dailyUserRole: '\t' }))).toContain('no_daily_user');
    });
  });

  describe('measurable outcome', () => {
    it('fires when there is neither a KPI nor an accepted proxy', () => {
      const context = cleanContext({
        measurableOutcome: { kpi: null, proxyAccepted: false },
      });
      expect(codes(context)).toContain('no_measurable_outcome');
    });

    it('does not fire when the client explicitly accepted a proxy measure', () => {
      const context = cleanContext({
        measurableOutcome: { kpi: null, proxyAccepted: true },
      });
      expect(codes(context)).not.toContain('no_measurable_outcome');
    });

    it('does not fire when a KPI is named', () => {
      expect(codes(cleanContext())).not.toContain('no_measurable_outcome');
    });
  });

  describe('required data access', () => {
    it('fires when a required system is prohibited', () => {
      const context = cleanContext({
        requiredSystems: [{ systemName: 'CRM', status: 'prohibited' }],
      });
      expect(codes(context)).toContain('required_data_prohibited');
    });

    it('fires when a required system is unavailable', () => {
      const context = cleanContext({
        requiredSystems: [{ systemName: 'Analytics warehouse', status: 'unavailable' }],
      });
      expect(codes(context)).toContain('required_data_prohibited');
    });

    it('names the affected systems so the client knows what to unblock', () => {
      const context = cleanContext({
        requiredSystems: [
          { systemName: 'CRM', status: 'prohibited' },
          { systemName: 'DAM', status: 'available' },
          { systemName: 'Warehouse', status: 'unavailable' },
        ],
      });
      const found = detectHardStops(context).find((s) => s.code === 'required_data_prohibited');
      expect(found?.reason).toContain('CRM');
      expect(found?.reason).toContain('Warehouse');
      expect(found?.reason).not.toContain('DAM');
    });

    it('treats "unknown" access as a confidence problem, not a blocker', () => {
      const context = cleanContext({
        requiredSystems: [{ systemName: 'Legacy PIM', status: 'unknown' }],
      });
      expect(codes(context)).not.toContain('required_data_prohibited');
    });
  });

  describe('review availability', () => {
    it('fires when brand review is required but no reviewer exists', () => {
      const context = cleanContext({
        review: {
          brandReviewRequired: true,
          brandReviewerAvailable: false,
          legalReviewRequired: false,
          legalReviewerAvailable: false,
        },
      });
      const found = detectHardStops(context).find(
        (s) => s.code === 'review_required_but_unavailable',
      );
      // Assert on the detail clause, not the boilerplate reason — the template
      // sentence mentions both disciplines regardless of which one is missing.
      expect(found?.reason).toContain('Missing reviewer for: brand.');
    });

    it('fires when legal review is required but no reviewer exists', () => {
      const context = cleanContext({
        review: {
          brandReviewRequired: false,
          brandReviewerAvailable: false,
          legalReviewRequired: true,
          legalReviewerAvailable: false,
        },
      });
      const found = detectHardStops(context).find(
        (s) => s.code === 'review_required_but_unavailable',
      );
      expect(found?.reason).toContain('Missing reviewer for: legal.');
    });

    it('reports a single stop naming both when brand and legal are both missing', () => {
      const context = cleanContext({
        review: {
          brandReviewRequired: true,
          brandReviewerAvailable: false,
          legalReviewRequired: true,
          legalReviewerAvailable: false,
        },
      });
      const found = detectHardStops(context).filter(
        (s) => s.code === 'review_required_but_unavailable',
      );
      expect(found).toHaveLength(1);
      expect(found[0]?.reason).toContain('brand, legal');
    });

    it('does not fire when review is not required at all', () => {
      const context = cleanContext({
        review: {
          brandReviewRequired: false,
          brandReviewerAvailable: false,
          legalReviewRequired: false,
          legalReviewerAvailable: false,
        },
      });
      expect(codes(context)).not.toContain('review_required_but_unavailable');
    });
  });

  describe('AI policy', () => {
    it('fires when policy prohibits the model or data flow, carrying the note', () => {
      const context = cleanContext({
        policy: {
          modelAndDataFlowPermitted: false,
          restrictionNote: 'Customer PII may not leave the EU region.',
        },
      });
      const found = detectHardStops(context).find(
        (s) => s.code === 'policy_prohibits_model_or_data_flow',
      );
      expect(found?.reason).toContain('may not leave the EU region');
    });

    it('still fires with a bare reason when no note was supplied', () => {
      const context = cleanContext({
        policy: { modelAndDataFlowPermitted: false, restrictionNote: null },
      });
      const found = detectHardStops(context).find(
        (s) => s.code === 'policy_prohibits_model_or_data_flow',
      );
      expect(found).toBeDefined();
      expect(found?.reason).toBe(
        'Client AI policy prohibits the model or data flow this workflow needs.',
      );
    });
  });

  describe('output checkability', () => {
    it('fires when high-impact output ships without a human check', () => {
      const context = cleanContext({
        output: { highImpact: true, humanCheckBeforeRelease: false },
      });
      expect(codes(context)).toContain('output_uncheckable_before_release');
    });

    it('does not fire when the output is low impact', () => {
      const context = cleanContext({
        output: { highImpact: false, humanCheckBeforeRelease: false },
      });
      expect(codes(context)).not.toContain('output_uncheckable_before_release');
    });
  });

  describe('dependencies', () => {
    it('fires when the client cannot provide a required integration or right', () => {
      const context = cleanContext({
        dependencies: [
          { name: 'Stock imagery licence', clientCanProvide: false },
          { name: 'DAM read API', clientCanProvide: true },
        ],
      });
      const found = detectHardStops(context).find(
        (s) => s.code === 'integration_or_right_unavailable',
      );
      expect(found?.reason).toContain('Stock imagery licence');
      expect(found?.reason).not.toContain('DAM read API');
    });

    it('does not fire when every dependency is available', () => {
      expect(codes(cleanContext())).not.toContain('integration_or_right_unavailable');
    });
  });

  it('reports every failing condition at once rather than stopping at the first', () => {
    const context = cleanContext({
      accountableOwnerRole: null,
      dailyUserRole: null,
      measurableOutcome: { kpi: null, proxyAccepted: false },
      requiredSystems: [{ systemName: 'CRM', status: 'prohibited' }],
      review: {
        brandReviewRequired: true,
        brandReviewerAvailable: false,
        legalReviewRequired: true,
        legalReviewerAvailable: false,
      },
      policy: { modelAndDataFlowPermitted: false, restrictionNote: null },
      output: { highImpact: true, humanCheckBeforeRelease: false },
      dependencies: [{ name: 'Anything', clientCanProvide: false }],
    });
    // A client who fixes one blocker only to discover the next has had a bad
    // five days — so all eight surface together.
    expect(codes(context)).toHaveLength(8);
  });

  it('gives every stop a resolution, so a blocked opportunity is still actionable', () => {
    const context = cleanContext({ accountableOwnerRole: null, dailyUserRole: null });
    for (const stop of detectHardStops(context)) {
      expect(stop.resolution.length, stop.code).toBeGreaterThan(0);
      expect(stop.reason.length, stop.code).toBeGreaterThan(0);
    }
  });
});
