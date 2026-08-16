/**
 * Business-case model — PRD §12.
 *
 * The governing rule for this whole module is §12.1: every value is either
 * client-supplied, derived from client-supplied values, or a strategist
 * planning assumption carrying a source and a confidence. Nothing is invented.
 * A missing cost stays missing and the scenario reports itself incomplete —
 * inventing a plausible number is how a business case becomes a liability.
 */

export type ScenarioName = 'conservative' | 'base' | 'upside';

export const SCENARIO_NAMES: readonly ScenarioName[] = Object.freeze([
  'conservative',
  'base',
  'upside',
]);

export type AssumptionOrigin = 'client_supplied' | 'derived' | 'strategist_estimate';

export type AssumptionConfidence = 'low' | 'medium' | 'high';

/**
 * One row of the editable assumption table §12.2 requires the UI to show.
 * `value` is nullable on purpose: "unknown" is a first-class state.
 */
export interface Assumption {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  origin: AssumptionOrigin;
  /** Where the number came from. Required for anything not client-supplied. */
  source: string;
  confidence: AssumptionConfidence;
}

/** How strongly the revenue claim is actually supported by evidence. */
export type CausalLinkStrength = 'strong' | 'moderate' | 'weak';

export interface ScenarioInputs {
  /** Q13 monthly volume for the workflow this opportunity touches. */
  monthlyWorkflowVolume: number | null;
  minutesSavedPerItem: number | null;
  /** Fully loaded cost per hour, in the assessment currency. */
  loadedHourlyCost: number | null;

  monthlyReworkEvents: number | null;
  costPerReworkEvent: number | null;
  /** 0–1. The share of rework events the workflow is expected to remove. */
  expectedReworkReduction: number | null;

  /** §12.2: kept separate from labour value when the causal link is weak. */
  evidenceBackedRevenueUpside: number | null;
  revenueCausalLink: CausalLinkStrength;

  pilotCost: number | null;
  annualRunCost: number | null;
}

export interface ScenarioResult {
  scenario: ScenarioName;
  /** ISO 4217. Never a symbol — §12.2 forbids hard-coding one. */
  currency: string;

  annualHoursSaved: number | null;
  annualLabourValue: number | null;
  annualReworkValue: number | null;

  /** Included in the headline only when the causal link is not weak. */
  annualRevenueUpside: number | null;
  /** Reported separately when the causal link is weak, never netted in. */
  separatedRevenueUpside: number | null;

  annualGrossValue: number | null;
  yearOneNetValue: number | null;
  /** Null when monthly value is zero or negative — §12.2 forbids showing it. */
  paybackMonths: number | null;

  /** True when every input needed for the headline figures was present. */
  complete: boolean;
  /** Assumption keys that were missing, so the UI can prompt for exactly those. */
  missingInputs: string[];
  /** Operator-facing notes: what was excluded and why. */
  notes: string[];
}

export interface BusinessCase {
  currency: string;
  scenarios: Record<ScenarioName, ScenarioResult>;
  assumptions: Assumption[];
  /**
   * §12.2: time savings are never presented as headcount reduction unless the
   * client has explicitly confirmed that framing.
   */
  headcountReductionConfirmed: boolean;
}
