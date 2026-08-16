#!/usr/bin/env tsx
/**
 * `pnpm demo` — the whole deterministic core, in memory, in about a second.
 *
 * No Docker, no database, no API key, no network. It runs the same §11 scoring
 * engine, the same §11.6 hard stops and the same §12 business-case arithmetic
 * that `pnpm db:seed` runs, over the same §29 Northstar Cloud fixture — it just
 * prints the result instead of writing it to Postgres.
 *
 * This exists so anyone who clones the repo can see the product's actual
 * decision logic working before deciding whether to set up services.
 */
import {
  BASE_SCENARIO,
  FIXTURE_CALCULATED_AT,
  NORTHSTAR_OPPORTUNITIES,
  type OpportunitySeed,
} from '../tests/fixtures/northstar-portfolio.js';
import { FACTORS } from '../packages/domain/src/scoring/factors.js';
import { detectHardStops } from '../packages/domain/src/scoring/hard-stops.js';
import { calculateOpportunityScore } from '../packages/domain/src/scoring/score.js';
import type {
  FactorScore,
  OpportunityScore,
  ScoredFactor,
} from '../packages/domain/src/scoring/types.js';
import {
  calculateScenario,
  describeSavings,
  resolveCurrency,
} from '../packages/domain/src/business-case/calculate.js';
import { analyseFriction, waitRatio } from '../packages/domain/src/workflow/analysis.js';
import { getTemplate } from '../packages/domain/src/workflow/templates.js';
import type { WorkflowStage } from '../packages/domain/src/workflow/types.js';

const CURRENCY = resolveCurrency('INR');

function rule(title: string): void {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
  console.log('─'.repeat(76));
}

function money(value: number | null): string {
  if (value === null) return '—';
  return `${CURRENCY} ${value.toLocaleString('en-IN')}`;
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

function score(seed: OpportunitySeed): OpportunityScore {
  return calculateOpportunityScore({
    factors: factorSet(seed.factors, seed.fallback),
    confidence: seed.confidence,
    hardStops: seed.hardStopContext ? detectHardStops(seed.hardStopContext) : [],
    calculatedAt: FIXTURE_CALCULATED_AT,
  });
}

/** The §29 ten-stage flow, with the timings the fixture observed. */
function observedStages(): WorkflowStage[] {
  const template = getTemplate('general_campaign')!;
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
      assessmentId: 'demo-assessment',
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

function days(minutes: number | null): string {
  return minutes === null ? '—' : `${(minutes / 60 / 24).toFixed(1)} days`;
}

function main(): void {
  console.log('\n\x1b[1mSignalScan — deterministic core demo\x1b[0m');
  console.log('Fixture: Northstar Cloud (synthetic, §29). No database, no model, no keys.');

  // ── 1. Where the time actually goes (§8) ──────────────────────────────────
  rule('1. Campaign flow — where the time actually goes (§8)');
  const stages = observedStages();
  const friction = analyseFriction(stages);
  const ratio = waitRatio(friction);
  console.log(`  Stages mapped            ${stages.length}`);
  console.log(`  Total elapsed            ${days(friction.totalElapsedMinutes)}`);
  console.log(`  Hands-on work            ${days(friction.totalWorkMinutes)}`);
  console.log(`  Of which waiting         ${ratio === null ? '—' : `${Math.round(ratio * 100)}%`}`);
  console.log('  Longest waits:');
  for (const point of friction.largestWaits) {
    console.log(`    ${days(point.value).padStart(9)} wait   ${point.stageName}`);
  }
  console.log('  Most reworked:');
  for (const point of friction.mostReworked) {
    console.log(`    ${point.stageName.padEnd(28)} ${point.label}`);
  }

  // ── 2. Scored portfolio (§11) ─────────────────────────────────────────────
  rule('2. Scored opportunity portfolio (§11) — arithmetic, never a prompt');
  const scored = NORTHSTAR_OPPORTUNITIES.map((seed) => ({ seed, score: score(seed) }));
  const ranked = [...scored].sort((a, b) => {
    const aBlocked = a.score.priorityBand === 'blocked' ? 1 : 0;
    const bBlocked = b.score.priorityBand === 'blocked' ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    return b.score.priorityScore - a.score.priorityScore;
  });

  console.log('   SCORE  BAND          OPPORTUNITY');
  for (const row of ranked) {
    console.log(
      `  ${row.score.priorityScore.toFixed(2).padStart(6)}  ${row.score.priorityBand.padEnd(12)}  ${row.seed.name}`,
    );
  }
  console.log(
    '\n  Note the last row: it outscores two backlog items and is still blocked.\n' +
      '  A hard stop overrides the ranking entirely (§11.5) — behaviour, not a bug.',
  );

  // ── 3. Why the blocked one is blocked (§11.6) ─────────────────────────────
  const blocked = ranked.find((r) => r.score.priorityBand === 'blocked');
  if (blocked) {
    rule(`3. Hard stops on "${blocked.seed.name}" (§11.6)`);
    for (const stop of blocked.score.hardStops) {
      console.log(`  ✖ ${stop.code}`);
      console.log(`      why      ${stop.reason}`);
      console.log(`      clears   ${stop.resolution}`);
    }
  }

  // ── 4. The recommendation, factor by factor (§11.1) ───────────────────────
  const winner = ranked[0]!;
  rule(`4. Recommendation — "${winner.seed.name}" (§11.1)`);
  console.log(`  Raw score       ${winner.score.rawScore} / 100  (integer-exact, §32.1)`);
  console.log(
    `  Confidence      ${winner.score.confidenceScore} → ×${winner.score.confidenceMultiplier}`,
  );
  console.log(`  Priority score  ${winner.score.priorityScore}`);
  console.log(`  Owner           ${winner.seed.ownerRole}`);
  console.log(`  KPI             ${winner.seed.kpi ?? '— (would be a hard stop)'}`);
  console.log('  Human gates:');
  for (const gate of winner.seed.humanGates) console.log(`    • ${gate}`);

  // ── 5. Business case (§12) ────────────────────────────────────────────────
  rule('5. Business case (§12) — base scenario');
  const base = calculateScenario('base', BASE_SCENARIO, CURRENCY);
  console.log(`  Annual hours saved      ${base.annualHoursSaved ?? '—'}`);
  console.log(`  Annual labour value     ${money(base.annualLabourValue)}`);
  console.log(`  Annual rework value     ${money(base.annualReworkValue)}`);
  console.log(`  Annual gross value      ${money(base.annualGrossValue)}`);
  console.log(`  Year-one net value      ${money(base.yearOneNetValue)}`);
  console.log(`  Payback                 ${base.paybackMonths ?? '—'} months`);
  if (base.annualHoursSaved !== null) {
    console.log(`\n  Reported as: ${describeSavings(base.annualHoursSaved, false)}`);
  }

  // ── 6. Missing data stays missing (§12.1) ─────────────────────────────────
  rule('6. A candidate with no cost data (§12.1) — nothing is invented');
  const incomplete = calculateScenario(
    'base',
    {
      ...BASE_SCENARIO,
      loadedHourlyCost: null,
      costPerReworkEvent: null,
      pilotCost: null,
      annualRunCost: null,
    },
    CURRENCY,
  );
  console.log(
    `  Annual hours saved      ${incomplete.annualHoursSaved ?? '—'}  (still computable)`,
  );
  console.log(`  Annual gross value      ${money(incomplete.annualGrossValue)}`);
  console.log(`  Payback                 ${incomplete.paybackMonths ?? '— (not shown)'}`);
  console.log(`  Complete                ${incomplete.complete}`);
  console.log(`  Waiting on              ${incomplete.missingInputs.join(', ')}`);
  for (const note of incomplete.notes) console.log(`  → ${note}`);

  console.log(
    '\nEvery number above was computed on this machine by the domain packages.\n' +
      'Run it again — it is byte-identical (§32.1). Next: `pnpm test` for the 304\n' +
      'unit tests, or the full local stack in docs/QUICKSTART.md.\n',
  );
}

main();
