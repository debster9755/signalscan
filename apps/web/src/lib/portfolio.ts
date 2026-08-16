/**
 * The page's data source — PRD §11, §12, §8.
 *
 * Two paths, deliberately. If a seeded database is reachable the page reads it,
 * which is what the product will always do. If it is not, the page computes the
 * same portfolio in memory from the §29 fixture using the same domain packages.
 *
 * That fallback is not a mock. `calculateOpportunityScore` and
 * `calculateScenario` are the exact functions the seed calls, so a reader
 * without Docker sees real output from the real engine rather than a screenshot
 * of one. Which path produced the page is stated on the page itself — a UI that
 * quietly swaps its data source is how a demo starts lying.
 */
// Must come first: this module reads process.env.DATABASE_URL below.
import './load-env';
import postgres from 'postgres';
import {
  calculateScenario,
  resolveCurrency,
  type ScenarioResult,
} from '@signalscan/domain/business-case';
import {
  BASE_SCENARIO,
  FIXTURE_CALCULATED_AT,
  NORTHSTAR_OPPORTUNITIES,
  northstarObservedStages,
} from '@signalscan/domain/fixtures';
import {
  calculateOpportunityScore,
  detectHardStops,
  FACTORS,
  type FactorScore,
  type HardStop,
  type PriorityBand,
  type ScoredFactor,
} from '@signalscan/domain/scoring';
import {
  analyseFriction,
  waitRatio,
  type FrictionAnalysis,
  type WorkflowStage,
} from '@signalscan/domain/workflow';

export type PortfolioSource = 'database' | 'fixture';

export interface Opportunity {
  name: string;
  outcome: string;
  valueHypothesis: string;
  ownerRole: string | null;
  kpi: string | null;
  agentActions: string[];
  humanGates: string[];
  rawScore: number;
  confidenceScore: number;
  confidenceMultiplier: number;
  priorityScore: number;
  priorityBand: PriorityBand;
  hardStops: HardStop[];
  factors: ScoredFactor[];
}

export interface Portfolio {
  source: PortfolioSource;
  sourceDetail: string;
  currency: string;
  opportunities: Opportunity[];
  friction: FrictionAnalysis;
  waitShare: number | null;
  stageCount: number;
  baseCase: ScenarioResult;
  incompleteCase: ScenarioResult;
}

/** §11.5: a blocked opportunity sorts below every unblocked one, whatever it scored. */
function rank(a: Opportunity, b: Opportunity): number {
  const aBlocked = a.priorityBand === 'blocked' ? 1 : 0;
  const bBlocked = b.priorityBand === 'blocked' ? 1 : 0;
  if (aBlocked !== bBlocked) return aBlocked - bBlocked;
  return b.priorityScore - a.priorityScore;
}

function factorSet(
  scores: Partial<Record<string, FactorScore>>,
  fallback: FactorScore,
): ScoredFactor[] {
  return FACTORS.map((definition) => ({
    key: definition.key,
    score: scores[definition.key] ?? fallback,
    weight: definition.weight,
    rationale: `Scored against the rubric anchor: ${definition.anchorFive}`,
    sourceCitationIds: [],
    overridden: false,
  }));
}

/** §12.1 — the candidate §29 requires to carry no cost data at all. */
const NO_COST_INPUTS = {
  ...BASE_SCENARIO,
  loadedHourlyCost: null,
  costPerReworkEvent: null,
  pilotCost: null,
  annualRunCost: null,
};

function fromFixture(detail: string): Portfolio {
  const currency = resolveCurrency('INR');
  const stages = northstarObservedStages();
  const friction = analyseFriction(stages);

  const opportunities = NORTHSTAR_OPPORTUNITIES.map((seed) => {
    const score = calculateOpportunityScore({
      factors: factorSet(seed.factors, seed.fallback),
      confidence: seed.confidence,
      hardStops: seed.hardStopContext ? detectHardStops(seed.hardStopContext) : [],
      calculatedAt: FIXTURE_CALCULATED_AT,
    });
    return {
      name: seed.name,
      outcome: seed.outcome,
      valueHypothesis: seed.valueHypothesis,
      ownerRole: seed.ownerRole,
      kpi: seed.kpi,
      agentActions: seed.agentActions,
      humanGates: seed.humanGates,
      rawScore: score.rawScore,
      confidenceScore: score.confidenceScore,
      confidenceMultiplier: score.confidenceMultiplier,
      priorityScore: score.priorityScore,
      priorityBand: score.priorityBand,
      hardStops: score.hardStops,
      factors: score.factors,
    };
  }).sort(rank);

  return {
    source: 'fixture',
    sourceDetail: detail,
    currency,
    opportunities,
    friction,
    waitShare: waitRatio(friction),
    stageCount: stages.length,
    baseCase: calculateScenario('base', BASE_SCENARIO, currency),
    incompleteCase: calculateScenario('base', NO_COST_INPUTS, currency),
  };
}

interface OpportunityRow {
  name: string;
  outcome: string;
  value_hypothesis: string;
  owner_role: string | null;
  kpi: string | null;
  agent_actions: string[];
  human_gates: string[];
  raw_score: string;
  confidence_score: string;
  confidence_multiplier: string;
  priority_score: string;
  priority_band: PriorityBand;
  hard_stops_json: HardStop[];
  factors_json: ScoredFactor[];
}

interface StageRow {
  order_number: number;
  name: string;
  work_time_minutes: number | null;
  elapsed_time_minutes: number | null;
  wait_time_minutes: number | null;
  rework_frequency: WorkflowStage['reworkFrequency'];
}

async function fromDatabase(databaseUrl: string): Promise<Portfolio | null> {
  const sql = postgres(databaseUrl, {
    onnotice: () => {},
    max: 2,
    // Fail fast: an unreachable database must fall back to the fixture in a
    // moment, not hang the page render for the default timeout.
    connect_timeout: 3,
  });

  try {
    const rows = await sql<OpportunityRow[]>`
      SELECT o.name, o.outcome, o.value_hypothesis, o.owner_role, o.kpi,
             o.agent_actions, o.human_gates,
             s.raw_score, s.confidence_score, s.confidence_multiplier,
             s.priority_score, s.priority_band, s.hard_stops_json, s.factors_json
      FROM opportunities o
      JOIN opportunity_scores s ON s.opportunity_id = o.id
      ORDER BY (s.priority_band = 'blocked'), s.priority_score DESC
    `;

    // An empty database is migrated but not seeded. That is a setup state, not
    // a data source — say so rather than rendering an empty page.
    if (rows.length === 0) return null;

    const stageRows = await sql<StageRow[]>`
      SELECT order_number, name, work_time_minutes, elapsed_time_minutes,
             wait_time_minutes, rework_frequency
      FROM workflow_stages
      WHERE variant = 'observed'
      ORDER BY order_number
    `;

    const stages = stageRows.map(
      (row) =>
        ({
          id: `stage-${row.order_number}`,
          assessmentId: 'seeded',
          order: row.order_number,
          name: row.name,
          trigger: '',
          inputAssetIds: [],
          ownerRole: '',
          contributorRoles: [],
          approverRoles: [],
          toolNames: [],
          actions: [],
          outputs: [],
          workTimeMinutes: row.work_time_minutes ?? undefined,
          elapsedTimeMinutes: row.elapsed_time_minutes ?? undefined,
          waitTimeMinutes: row.wait_time_minutes ?? undefined,
          reworkFrequency: row.rework_frequency,
          reworkReasons: [],
          riskTags: [],
          sourceCitationIds: [],
          captureMethod: 'interview',
          status: 'operator_validated',
        }) satisfies WorkflowStage,
    );

    const [caseRow] = await sql<{ currency: string; scenarios_json: Record<string, unknown> }[]>`
      SELECT currency, scenarios_json FROM business_cases LIMIT 1
    `;

    const currency = resolveCurrency(caseRow?.currency ?? 'INR');
    const friction = analyseFriction(stages);
    const stored = caseRow?.scenarios_json?.base;
    const baseInputs = stored ? { ...BASE_SCENARIO, ...stored } : BASE_SCENARIO;

    return {
      source: 'database',
      sourceDetail: 'Read from the seeded Postgres database.',
      currency,
      opportunities: rows.map((row) => ({
        name: row.name,
        outcome: row.outcome,
        valueHypothesis: row.value_hypothesis,
        ownerRole: row.owner_role,
        kpi: row.kpi,
        agentActions: row.agent_actions,
        humanGates: row.human_gates,
        // numeric columns arrive as strings; parsing here keeps the formatting
        // helpers from having to care.
        rawScore: Number(row.raw_score),
        confidenceScore: Number(row.confidence_score),
        confidenceMultiplier: Number(row.confidence_multiplier),
        priorityScore: Number(row.priority_score),
        priorityBand: row.priority_band,
        hardStops: row.hard_stops_json,
        factors: row.factors_json,
      })),
      friction,
      waitShare: waitRatio(friction),
      stageCount: stages.length,
      baseCase: calculateScenario('base', baseInputs, currency),
      incompleteCase: calculateScenario('base', NO_COST_INPUTS, currency),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function loadPortfolio(): Promise<Portfolio> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return fromFixture('No DATABASE_URL is set, so this page computed everything in memory.');
  }

  try {
    const fromDb = await fromDatabase(databaseUrl);
    if (fromDb) return fromDb;
    return fromFixture('The database is reachable but not seeded yet — run `pnpm db:seed`.');
  } catch {
    // Deliberately not surfacing the driver error: it can contain the database
    // URL, and §22.1 keeps connection detail out of anything a browser renders.
    return fromFixture('The database was unreachable, so this page computed everything in memory.');
  }
}
