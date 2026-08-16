import { roundTo } from '../scoring/confidence';
import type { ScenarioInputs, ScenarioName, ScenarioResult } from './types';

/**
 * §12.2 calculations.
 *
 * Two rules shape every function here:
 *   1. Never invent a missing value (§10.2, §12.1). A null in, a null out, and
 *      the key recorded in `missingInputs` so the UI can ask for it.
 *   2. Never present a payback that does not exist (§12.2) — if monthly value
 *      is zero or negative, `paybackMonths` is null, not Infinity and not a
 *      large number that looks like an answer.
 */

const MONEY_DECIMAL_PLACES = 2;
const HOURS_DECIMAL_PLACES = 1;

export const DEFAULT_CURRENCY = 'INR';

/** ISO 4217: three uppercase letters. Symbols are a display concern, not a model one. */
const ISO_4217 = /^[A-Z]{3}$/;

export class BusinessCaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessCaseError';
  }
}

/**
 * §12.2: "Default currency is INR only when the client has not specified one."
 * An explicitly supplied currency always wins; a malformed one is an error
 * rather than a silent fallback, because quietly switching a client's currency
 * is worse than refusing to render.
 */
export function resolveCurrency(assessmentCurrency: string | null | undefined): string {
  if (assessmentCurrency === null || assessmentCurrency === undefined) {
    return DEFAULT_CURRENCY;
  }
  const trimmed = assessmentCurrency.trim().toUpperCase();
  if (trimmed.length === 0) return DEFAULT_CURRENCY;
  if (!ISO_4217.test(trimmed)) {
    throw new BusinessCaseError(
      `Currency "${assessmentCurrency}" is not a valid ISO 4217 code. Store the code, never a symbol (§23.5).`,
    );
  }
  return trimmed;
}

function requireNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new BusinessCaseError(`${label} must be a finite number, got ${value}.`);
  }
  if (value < 0) {
    throw new BusinessCaseError(`${label} cannot be negative, got ${value}.`);
  }
  return value;
}

/**
 * annual_hours_saved = monthly_workflow_volume * minutes_saved_per_item / 60 * 12
 */
export function annualHoursSaved(
  monthlyWorkflowVolume: number,
  minutesSavedPerItem: number,
): number {
  requireNonNegative(monthlyWorkflowVolume, 'Monthly workflow volume');
  requireNonNegative(minutesSavedPerItem, 'Minutes saved per item');
  return roundTo((monthlyWorkflowVolume * minutesSavedPerItem * 12) / 60, HOURS_DECIMAL_PLACES);
}

/** annual_labor_value = annual_hours_saved * loaded_hourly_cost */
export function annualLabourValue(hoursSaved: number, loadedHourlyCost: number): number {
  requireNonNegative(hoursSaved, 'Annual hours saved');
  requireNonNegative(loadedHourlyCost, 'Loaded hourly cost');
  return roundTo(hoursSaved * loadedHourlyCost, MONEY_DECIMAL_PLACES);
}

/**
 * annual_rework_value =
 *   monthly_rework_events * cost_per_rework_event * expected_rework_reduction * 12
 */
export function annualReworkValue(
  monthlyReworkEvents: number,
  costPerReworkEvent: number,
  expectedReworkReduction: number,
): number {
  requireNonNegative(monthlyReworkEvents, 'Monthly rework events');
  requireNonNegative(costPerReworkEvent, 'Cost per rework event');
  if (expectedReworkReduction < 0 || expectedReworkReduction > 1) {
    throw new BusinessCaseError(
      `Expected rework reduction must be between 0 and 1, got ${expectedReworkReduction}.`,
    );
  }
  return roundTo(
    monthlyReworkEvents * costPerReworkEvent * expectedReworkReduction * 12,
    MONEY_DECIMAL_PLACES,
  );
}

/**
 * payback_months = pilot_cost / ((annual_gross_value - annual_run_cost) / 12)
 *
 * Returns null rather than Infinity when there is no positive monthly value.
 * §12.2: "Do not show payback if monthly value is zero or negative."
 */
export function paybackMonths(
  pilotCost: number,
  annualGrossValue: number,
  annualRunCost: number,
): number | null {
  requireNonNegative(pilotCost, 'Pilot cost');
  const monthlyNetValue = (annualGrossValue - annualRunCost) / 12;
  if (monthlyNetValue <= 0) return null;
  return roundTo(pilotCost / monthlyNetValue, 1);
}

interface RequiredInput {
  key: string;
  value: number | null;
}

function collectMissing(inputs: RequiredInput[]): string[] {
  return inputs.filter((i) => i.value === null).map((i) => i.key);
}

/**
 * Builds one scenario. Partial data produces a partial result, never a guess:
 * labour value can be present while rework value is unknown, and the scenario
 * still reports which inputs it is waiting on.
 */
export function calculateScenario(
  scenario: ScenarioName,
  inputs: ScenarioInputs,
  currency: string,
): ScenarioResult {
  const notes: string[] = [];

  const missingInputs = collectMissing([
    { key: 'monthlyWorkflowVolume', value: inputs.monthlyWorkflowVolume },
    { key: 'minutesSavedPerItem', value: inputs.minutesSavedPerItem },
    { key: 'loadedHourlyCost', value: inputs.loadedHourlyCost },
    { key: 'monthlyReworkEvents', value: inputs.monthlyReworkEvents },
    { key: 'costPerReworkEvent', value: inputs.costPerReworkEvent },
    { key: 'expectedReworkReduction', value: inputs.expectedReworkReduction },
    { key: 'pilotCost', value: inputs.pilotCost },
    { key: 'annualRunCost', value: inputs.annualRunCost },
  ]);

  const hoursSaved =
    inputs.monthlyWorkflowVolume !== null && inputs.minutesSavedPerItem !== null
      ? annualHoursSaved(inputs.monthlyWorkflowVolume, inputs.minutesSavedPerItem)
      : null;

  const labourValue =
    hoursSaved !== null && inputs.loadedHourlyCost !== null
      ? annualLabourValue(hoursSaved, inputs.loadedHourlyCost)
      : null;

  const reworkValue =
    inputs.monthlyReworkEvents !== null &&
    inputs.costPerReworkEvent !== null &&
    inputs.expectedReworkReduction !== null
      ? annualReworkValue(
          inputs.monthlyReworkEvents,
          inputs.costPerReworkEvent,
          inputs.expectedReworkReduction,
        )
      : null;

  // §12.2: "Keep revenue upside separate if the causal link is weak."
  const revenueIsWeak = inputs.revenueCausalLink === 'weak';
  const includedRevenue =
    inputs.evidenceBackedRevenueUpside !== null && !revenueIsWeak
      ? inputs.evidenceBackedRevenueUpside
      : null;
  const separatedRevenue =
    inputs.evidenceBackedRevenueUpside !== null && revenueIsWeak
      ? inputs.evidenceBackedRevenueUpside
      : null;

  if (separatedRevenue !== null) {
    notes.push(
      'Revenue upside is reported separately and excluded from the net value: the causal link to this workflow is weak.',
    );
  }

  // Gross value needs at least one value stream to mean anything.
  const valueStreams = [labourValue, reworkValue, includedRevenue].filter(
    (v): v is number => v !== null,
  );
  const annualGrossValue =
    valueStreams.length > 0
      ? roundTo(
          valueStreams.reduce((sum, v) => sum + v, 0),
          MONEY_DECIMAL_PLACES,
        )
      : null;

  const complete = missingInputs.length === 0;

  const yearOneNetValue =
    annualGrossValue !== null && inputs.pilotCost !== null && inputs.annualRunCost !== null
      ? roundTo(annualGrossValue - inputs.pilotCost - inputs.annualRunCost, MONEY_DECIMAL_PLACES)
      : null;

  const payback =
    annualGrossValue !== null && inputs.pilotCost !== null && inputs.annualRunCost !== null
      ? paybackMonths(inputs.pilotCost, annualGrossValue, inputs.annualRunCost)
      : null;

  if (payback === null && annualGrossValue !== null && inputs.annualRunCost !== null) {
    notes.push(
      'Payback is not shown: the workflow does not produce positive monthly value at these assumptions.',
    );
  }

  if (!complete) {
    notes.push(
      `Incomplete: ${missingInputs.length} input(s) are still unknown. Missing values are never estimated (§12.1).`,
    );
  }

  return {
    scenario,
    currency,
    annualHoursSaved: hoursSaved,
    annualLabourValue: labourValue,
    annualReworkValue: reworkValue,
    annualRevenueUpside: includedRevenue,
    separatedRevenueUpside: separatedRevenue,
    annualGrossValue,
    yearOneNetValue,
    paybackMonths: payback,
    complete,
    missingInputs,
    notes,
  };
}

/**
 * §12.2: never describe time savings as headcount reduction unless the client
 * confirmed that use. Returns the phrasing the report is allowed to use.
 */
export function describeSavings(hoursSaved: number, headcountReductionConfirmed: boolean): string {
  const rounded = roundTo(hoursSaved, HOURS_DECIMAL_PLACES);
  if (headcountReductionConfirmed) {
    return `${rounded} hours per year, which the client has confirmed may be presented as capacity reduction.`;
  }
  return `${rounded} hours per year of capacity released back to the team.`;
}
