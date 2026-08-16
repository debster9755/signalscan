/**
 * The synthetic Northstar Cloud opportunity portfolio — PRD §29.
 *
 * Six candidates covering the cases §29 requires: a clear winner, a
 * conditional, two backlog items, one candidate with no cost data at all, and
 * one hard-stop case that outscores two backlog items and is still blocked.
 *
 * This lives here rather than inside `db/seed.ts` because three entry points
 * need the same portfolio and they must never drift apart:
 *
 *   - `db/seed.ts`      loads it into Postgres (needs Docker)
 *   - `scripts/demo.ts` scores it in memory (needs nothing)
 *   - `apps/web`        falls back to it when no database is reachable
 *
 * Everything here is invented. §29 forbids real client logos, copy, personal
 * data or confidential examples in committed fixtures.
 */
import type { ScenarioInputs } from '../business-case/types';
import { getTemplate } from '../workflow/templates';
import type { WorkflowStage } from '../workflow/types';
import { type HardStopContext } from '../scoring/hard-stops';
import type { ConfidenceInput, FactorScore } from '../scoring/types';

/** §11.4 — a well-evidenced candidate. */
export const CONFIDENT: ConfidenceInput = {
  evidenceCoverage: 0.82,
  sourceAgreement: 0.75,
  evidenceRecency: 0.9,
  reviewerValidation: 0.6,
};

/** §11.4 — a candidate the evidence does not yet support. */
export const THIN: ConfidenceInput = {
  evidenceCoverage: 0.35,
  sourceAgreement: 0.4,
  evidenceRecency: 0.5,
  reviewerValidation: 0.1,
};

/** A workflow with no daily user and no measurable outcome — §29's hard-stop case. */
export const BLOCKED_CONTEXT: HardStopContext = {
  accountableOwnerRole: 'Marketing Operations Lead',
  dailyUserRole: null,
  measurableOutcome: { kpi: null, proxyAccepted: false },
  requiredSystems: [{ systemName: 'Customer CRM', status: 'prohibited' }],
  review: {
    brandReviewRequired: true,
    brandReviewerAvailable: true,
    legalReviewRequired: true,
    legalReviewerAvailable: true,
  },
  policy: { modelAndDataFlowPermitted: true, restrictionNote: null },
  output: { highImpact: true, humanCheckBeforeRelease: true },
  dependencies: [],
};

/** The §12.2 base-scenario assumptions attached to every costed candidate. */
export const BASE_SCENARIO: ScenarioInputs = {
  monthlyWorkflowVolume: 180,
  minutesSavedPerItem: 12,
  loadedHourlyCost: 1450,
  monthlyReworkEvents: 9,
  costPerReworkEvent: 8500,
  expectedReworkReduction: 0.4,
  evidenceBackedRevenueUpside: null,
  revenueCausalLink: 'weak',
  pilotCost: 450000,
  annualRunCost: 180000,
};

export interface OpportunitySeed {
  name: string;
  outcome: string;
  valueHypothesis: string;
  ownerRole: string;
  kpi: string | null;
  agentActions: string[];
  humanGates: string[];
  factors: Partial<Record<string, FactorScore>>;
  fallback: FactorScore;
  confidence: ConfidenceInput;
  hardStopContext?: HardStopContext;
  /** §29 requires one candidate with no cost data at all. */
  missingCost?: boolean;
}

export const NORTHSTAR_OPPORTUNITIES: OpportunitySeed[] = [
  {
    name: 'Brand-checked variant generation',
    outcome:
      'Produce channel variants from an approved master asset with brand rules applied before human review.',
    valueHypothesis:
      'Variant production and resizing is the single most repeated task, and brand review is the largest wait point.',
    ownerRole: 'Marketing Operations Lead',
    kpi: 'Brief-to-launch cycle time',
    agentActions: [
      'Read the approved master asset and campaign brief',
      'Generate channel variants against approved brand rules',
      'Flag any variant that breaches a prohibited-language rule',
    ],
    humanGates: ['Brand Manager approves every variant before release'],
    factors: {
      outcome_impact: 5,
      frequency_volume: 5,
      cycle_time_opportunity: 5,
      task_repeatability: 5,
    },
    fallback: 4,
    confidence: CONFIDENT,
  },
  {
    name: 'Brief completeness assistant',
    outcome: 'Check an incoming brief for missing information before it enters production.',
    valueHypothesis: 'Unclear briefs are the most cited rework reason across the flow.',
    ownerRole: 'Marketing Operations Lead',
    kpi: 'Rework events per campaign',
    agentActions: [
      'Compare the brief against the required-field checklist',
      'Draft clarifying questions',
    ],
    humanGates: ['Requester confirms the additions'],
    factors: { outcome_impact: 4, frequency_volume: 5, cycle_time_opportunity: 4, clear_owner: 5 },
    fallback: 4,
    confidence: CONFIDENT,
  },
  {
    name: 'Claims pre-check for legal review',
    outcome: 'Pre-screen copy for regulated claims so legal review starts from a shorter list.',
    valueHypothesis: 'Legal review is the largest single wait in the flow at 8+ days.',
    ownerRole: 'Brand Manager',
    kpi: 'Legal review turnaround',
    agentActions: ['Identify claim-like statements', 'Match each against the approved-claims list'],
    humanGates: ['Legal Counsel makes every final compliance decision'],
    factors: {
      outcome_impact: 4,
      cycle_time_opportunity: 5,
      brand_claims_safety: 3,
      legal_regulatory_safety: 3,
    },
    fallback: 3,
    confidence: CONFIDENT,
  },
  {
    name: 'Localisation drafting for three markets',
    outcome: 'Draft market-specific adaptations of approved copy for local review.',
    valueHypothesis: 'Localisation repeats across three markets every campaign.',
    ownerRole: 'Content Producer',
    kpi: 'Localisation hours per campaign',
    agentActions: ['Adapt approved copy per market', 'Preserve approved claims verbatim'],
    humanGates: ['Local market reviewer approves before use'],
    factors: { outcome_impact: 3, frequency_volume: 4, task_repeatability: 4 },
    fallback: 3,
    confidence: THIN,
  },
  {
    name: 'Campaign performance summarisation',
    outcome: 'Draft the post-campaign performance readout from warehouse data.',
    valueHypothesis:
      'Reporting is repeated work but sits after launch, so it does not shorten the cycle.',
    ownerRole: 'Data Analyst',
    kpi: 'Reporting hours per campaign',
    agentActions: ['Pull agreed metrics', 'Draft a narrative summary'],
    humanGates: ['Analyst verifies every figure before circulation'],
    factors: { outcome_impact: 2, cycle_time_opportunity: 1, strategic_visibility: 2 },
    fallback: 3,
    confidence: THIN,
    missingCost: true,
  },
  {
    name: 'Autonomous audience expansion',
    outcome: 'Expand paid audiences automatically using CRM segments.',
    valueHypothesis: 'Potentially valuable, but depends on data the client cannot release.',
    ownerRole: 'Marketing Operations Lead',
    kpi: null,
    agentActions: ['Read CRM segments', 'Adjust audience targeting'],
    humanGates: [],
    factors: { outcome_impact: 5, frequency_volume: 4, data_privacy_safety: 0 },
    fallback: 3,
    confidence: THIN,
    hardStopContext: BLOCKED_CONTEXT,
  },
];

/**
 * Fixed so a score is byte-identical on every machine and in every run.
 * §32.1 requires reproducibility; a wall clock would not deliver it.
 */
export const FIXTURE_CALCULATED_AT = new Date('2026-08-16T09:00:00.000Z');

/**
 * The §29 ten-stage campaign flow with the timings the fixture observed.
 *
 * The shape of this data is the whole finding: 26 days elapsed against 1.8 days
 * of hands-on work. Legal review is a single 8-day wait, and brand review is
 * sent back almost every time.
 */
export function northstarObservedStages(): WorkflowStage[] {
  const template = getTemplate('general_campaign');
  if (!template) throw new Error('general_campaign template is missing');

  const timing = [
    { work: 30, elapsed: 240, wait: 210, rework: 'rare' },
    { work: 180, elapsed: 960, wait: 780, rework: 'rare' },
    { work: 240, elapsed: 2880, wait: 2640, rework: 'often' },
    { work: 120, elapsed: 1440, wait: 1320, rework: 'sometimes' },
    { work: 480, elapsed: 4320, wait: 3840, rework: 'sometimes' },
    { work: 960, elapsed: 7200, wait: 6240, rework: 'often' },
    { work: 120, elapsed: 5760, wait: 5640, rework: 'almost_always' },
    { work: 90, elapsed: 11520, wait: 11430, rework: 'sometimes' },
    { work: 240, elapsed: 480, wait: 240, rework: 'rare' },
    { work: 180, elapsed: 2880, wait: 2700, rework: 'never' },
  ] as const;

  return template.stages.map((stage, i) => {
    const t = timing[i]!;
    return {
      id: `stage-${i + 1}`,
      assessmentId: 'northstar-fixture',
      order: i + 1,
      name: stage.name,
      description: stage.description,
      trigger: stage.trigger,
      inputAssetIds: [],
      ownerRole: stage.suggestedOwnerRole,
      contributorRoles: [],
      approverRoles: [],
      toolNames: [],
      actions: [],
      outputs: [...stage.suggestedOutputs],
      workTimeMinutes: t.work,
      elapsedTimeMinutes: t.elapsed,
      waitTimeMinutes: t.wait,
      reworkFrequency: t.rework,
      reworkReasons: [],
      riskTags: [...stage.riskTags],
      sourceCitationIds: [],
      captureMethod: 'interview',
      status: 'operator_validated',
    };
  });
}
