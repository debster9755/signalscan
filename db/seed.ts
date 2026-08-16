#!/usr/bin/env tsx
/**
 * Synthetic seed — PRD §29.
 *
 * Creates the fictional client "Northstar Cloud" with everything §29 lists:
 * four users, one guideline document, 25 campaigns across four channels with
 * three on-brand and two off-brand labels, two competitors with eight evidence
 * records each, a ten-stage workflow, six candidate opportunities including one
 * hard-stop case and one missing-cost case.
 *
 * Everything is invented. §29 forbids real client logos, copy, personal data or
 * confidential examples in committed fixtures, and §28.1 forbids production
 * evidence outside production — so this file is the only data any developer or
 * CI run should ever see.
 *
 * Scores are computed by the real §11 engine rather than hard-coded, so the
 * seed doubles as an end-to-end check that the domain layer and the schema
 * agree.
 */
// Must come first: every import below may read process.env.
import './load-env.js';
import { reportFailure } from './fail.js';
import postgres from 'postgres';
import {
  BASE_SCENARIO,
  FIXTURE_CALCULATED_AT,
  NORTHSTAR_OPPORTUNITIES,
} from '@signalscan/domain/fixtures';
import { northstarIntakeResponses, QUESTIONS } from '@signalscan/domain/intake';
import {
  calculateOpportunityScore,
  detectHardStops,
  FACTORS,
  type FactorScore,
  type ScoredFactor,
} from '@signalscan/domain/scoring';
import { getTemplate } from '@signalscan/domain/workflow';

const CHANNELS = ['email', 'paid_social', 'web', 'events', 'search'] as const;

/** Deterministic pseudo-random so the seed is byte-identical on every machine. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
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

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Start services with `pnpm dev:services` first.');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { onnotice: () => {}, max: 1 });
  const random = seededRandom(20260816);

  try {
    await sql.begin(async (tx) => {
      // Idempotent: a re-run replaces the fixture rather than duplicating it.
      await tx`DELETE FROM organizations WHERE slug IN ('northstar-cloud', 'red-baron')`;
      await tx`DELETE FROM users WHERE email LIKE '%@example.test'`;
      await tx`DELETE FROM question_definitions`;

      // ── Question definitions (§7.3, versioned) ────────────────────────────
      for (const question of QUESTIONS) {
        await tx`
          INSERT INTO question_definitions (id, version, group_key, order_number, definition_json, active)
          VALUES (${question.id}, ${question.version}, ${question.group}, ${question.order},
                  ${tx.json(question as unknown as Record<string, unknown>)}, true)
        `;
      }

      // ── Organisations ─────────────────────────────────────────────────────
      const [redBaron] = await tx<{ id: string }[]>`
        INSERT INTO organizations (name, slug, type) VALUES ('Red Baron', 'red-baron', 'red_baron')
        RETURNING id
      `;
      const [northstar] = await tx<{ id: string }[]>`
        INSERT INTO organizations (name, slug, type, default_retention_days)
        VALUES ('Northstar Cloud', 'northstar-cloud', 'client', 90)
        RETURNING id
      `;
      if (!redBaron || !northstar) throw new Error('Failed to create organisations');

      // ── Users (§29: sponsor, operator, brand reviewer, strategist) ────────
      const people = [
        { email: 'strategist@example.test', name: 'Priya Raman (Strategist)', role: 'strategist' },
        {
          email: 'sponsor@example.test',
          name: 'Anil Kapadia (Head of Marketing)',
          role: 'client_sponsor',
        },
        {
          email: 'operator@example.test',
          name: 'Meera Joshi (Marketing Ops Lead)',
          role: 'client_contributor',
        },
        {
          email: 'reviewer@example.test',
          name: 'Tom Iyer (Brand Manager)',
          role: 'client_reviewer',
        },
      ] as const;

      const userIds: Record<string, string> = {};
      for (const person of people) {
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO users (email, display_name) VALUES (${person.email}, ${person.name})
          RETURNING id
        `;
        if (!row) throw new Error(`Failed to create user ${person.email}`);
        userIds[person.role] = row.id;
      }

      const strategistId = userIds.strategist!;
      const sponsorId = userIds.client_sponsor!;
      const operatorId = userIds.client_contributor!;
      const reviewerId = userIds.client_reviewer!;

      const [workspace] = await tx<{ id: string }[]>`
        INSERT INTO workspaces (client_organization_id, name, retention_days, created_by)
        VALUES (${northstar.id}, 'Northstar Cloud — SignalScan', 90, ${strategistId})
        RETURNING id
      `;
      if (!workspace) throw new Error('Failed to create workspace');

      for (const person of people) {
        await tx`
          INSERT INTO workspace_users (workspace_id, user_id, role, status, accepted_at)
          VALUES (${workspace.id}, ${userIds[person.role]}, ${person.role}::workspace_role, 'active', now())
        `;
      }

      // A second workspace with no shared members. The integration suite uses
      // it to prove cross-workspace reads fail (§26.2, §32.3) — an isolation
      // test needs something real to fail to reach.
      const [otherOrg] = await tx<{ id: string }[]>`
        INSERT INTO organizations (name, slug, type) VALUES ('Vantage Retail', 'vantage-retail', 'client')
        RETURNING id
      `;
      const [otherUser] = await tx<{ id: string }[]>`
        INSERT INTO users (email, display_name) VALUES ('outsider@example.test', 'Outsider')
        RETURNING id
      `;
      const [otherWorkspace] = await tx<{ id: string }[]>`
        INSERT INTO workspaces (client_organization_id, name, retention_days, created_by)
        VALUES (${otherOrg!.id}, 'Vantage Retail — SignalScan', 90, ${strategistId})
        RETURNING id
      `;
      await tx`
        INSERT INTO workspace_users (workspace_id, user_id, role, status, accepted_at)
        VALUES (${otherWorkspace!.id}, ${otherUser!.id}, 'strategist', 'active', now())
      `;
      await tx`
        INSERT INTO assessments (workspace_id, title, status, owner_user_id, created_by)
        VALUES (${otherWorkspace!.id}, 'Vantage Retail scan', 'draft', ${otherUser!.id}, ${otherUser!.id})
      `;

      // ── Assessment ────────────────────────────────────────────────────────
      const [assessment] = await tx<{ id: string }[]>`
        INSERT INTO assessments (
          workspace_id, title, status, owner_user_id, sponsor_user_id, operator_user_id,
          focus_product, focus_market, focus_audience, currency, created_by
        ) VALUES (
          ${workspace.id}, 'Northstar Cloud — first agentic marketing workflow', 'strategist_review',
          ${strategistId}, ${sponsorId}, ${operatorId},
          'Northstar Vault — cloud backup for mid-market IT', 'India and South-East Asia',
          'IT infrastructure managers', 'INR', ${strategistId}
        ) RETURNING id
      `;
      if (!assessment) throw new Error('Failed to create assessment');

      // ── Intake responses ──────────────────────────────────────────────────
      const responses = northstarIntakeResponses();
      for (const question of QUESTIONS) {
        const value = responses[question.id];
        if (value === undefined) continue;
        await tx`
          INSERT INTO question_responses (
            workspace_id, assessment_id, question_id, question_version,
            response_json, status, answered_by, answered_at, confirmed_by, confirmed_at, created_by
          ) VALUES (
            ${workspace.id}, ${assessment.id}, ${question.id}, ${question.version},
            ${tx.json(value as Record<string, unknown>)}, 'confirmed',
            ${operatorId}, now(), ${sponsorId}, now(), ${operatorId}
          )
        `;
      }

      // ── Evidence: one guideline document plus 25 campaigns ────────────────
      const retention = new Date();
      retention.setDate(retention.getDate() + 90);

      const [guideline] = await tx<{ id: string }[]>`
        INSERT INTO input_assets (
          workspace_id, assessment_id, category, status, original_name, mime_type,
          size_bytes, sha256, storage_key, retention_delete_at, created_by
        ) VALUES (
          ${workspace.id}, ${assessment.id}, 'brand_guideline', 'parsed',
          'northstar-brand-guide-2024.pdf', 'application/pdf', 2411008,
          ${'a'.repeat(64)}, ${`${workspace.id}/guidelines/northstar-brand-guide-2024.pdf`},
          ${retention.toISOString()}, ${operatorId}
        ) RETURNING id
      `;

      const [chunk] = await tx<{ id: string }[]>`
        INSERT INTO asset_chunks (workspace_id, assessment_id, asset_id, chunk_index, content, location_json, content_hash)
        VALUES (
          ${workspace.id}, ${assessment.id}, ${guideline!.id}, 0,
          'Northstar speaks plainly. We never promise zero downtime; we promise measured recovery times.',
          ${tx.json({ page: 12, section: 'Voice and tone' })}, ${'b'.repeat(64)}
        ) RETURNING id
      `;

      const [citation] = await tx<{ id: string }[]>`
        INSERT INTO evidence_citations (
          workspace_id, assessment_id, asset_id, chunk_id, location_json,
          evidence_excerpt, excerpt_hash, created_by_type
        ) VALUES (
          ${workspace.id}, ${assessment.id}, ${guideline!.id}, ${chunk!.id},
          ${tx.json({ page: 12, section: 'Voice and tone' })},
          'We never promise zero downtime; we promise measured recovery times.',
          ${'c'.repeat(64)}, 'model'
        ) RETURNING id
      `;

      // 25 campaigns: 3 explicitly on-brand, 2 off-brand, the rest neutral.
      const onBrandIndexes = new Set([4, 11, 19]);
      const offBrandIndexes = new Set([7, 22]);
      for (let i = 1; i <= 25; i += 1) {
        const label = onBrandIndexes.has(i)
          ? 'on_brand'
          : offBrandIndexes.has(i)
            ? 'off_brand'
            : 'neutral';
        const channelCount = 1 + Math.floor(random() * 2);
        const channels = Array.from(
          { length: channelCount },
          () => CHANNELS[Math.floor(random() * CHANNELS.length)]!,
        );
        const date = new Date(2025, 0, 1);
        date.setDate(date.getDate() + i * 21);

        await tx`
          INSERT INTO campaigns (
            workspace_id, assessment_id, title, campaign_date, product, market,
            audience, objective, channels, brand_label, created_by
          ) VALUES (
            ${workspace.id}, ${assessment.id},
            ${`Campaign ${String(i).padStart(3, '0')} — Northstar Vault`},
            ${date.toISOString().slice(0, 10)},
            'Northstar Vault', ${i % 3 === 0 ? 'South-East Asia' : 'India'},
            'IT infrastructure managers',
            ${i % 2 === 0 ? 'Demand generation' : 'Product launch'},
            ${[...new Set(channels)]}, ${label}::brand_label, ${operatorId}
          )
        `;
      }

      // ── Competitors, eight public-evidence observations each (§9.3) ───────
      const AXES = [
        'core_value_proposition',
        'message_territories',
        'audience_addressed',
        'tone_and_vocabulary',
        'proof_and_claims_style',
        'cta_behaviour',
        'channel_patterns',
        'visual_territory',
      ];
      const CLASSIFICATIONS = [
        'distinctive_to_client',
        'shared_with_competitor',
        'category_convention',
        'competitor_distinctive',
        'unproven',
      ];

      for (const competitor of [
        { name: 'Meridian Data', url: 'https://example.com/meridian-data' },
        { name: 'Kestrel Cloud', url: 'https://example.com/kestrel-cloud' },
      ]) {
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO competitors (
            workspace_id, assessment_id, name, official_url, rationale,
            desired_difference, status, confirmed_by, confirmed_at, created_by
          ) VALUES (
            ${workspace.id}, ${assessment.id}, ${competitor.name}, ${competitor.url},
            'Competes for the same mid-market backup deals.',
            'Northstar must own measured reliability rather than price.',
            'confirmed', ${sponsorId}, now(), ${strategistId}
          ) RETURNING id
        `;

        for (let i = 0; i < AXES.length; i += 1) {
          await tx`
            INSERT INTO competitor_observations (
              workspace_id, assessment_id, competitor_id, axis, observation,
              classification, source_citation_ids, observed_at, created_by
            ) VALUES (
              ${workspace.id}, ${assessment.id}, ${row!.id}, ${AXES[i]!},
              ${`${competitor.name} public page emphasises ${AXES[i]!.replace(/_/g, ' ')}.`},
              ${CLASSIFICATIONS[i % CLASSIFICATIONS.length]!},
              ${[citation!.id]}, '2026-07-01', ${strategistId}
            )
          `;
        }
      }

      // ── Ten-stage workflow, operator validated (§8, §29) ──────────────────
      const template = getTemplate('general_campaign')!;
      const stageTiming = [
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
      ];

      for (let i = 0; i < template.stages.length; i += 1) {
        const stage = template.stages[i]!;
        const timing = stageTiming[i]!;
        await tx`
          INSERT INTO workflow_stages (
            workspace_id, assessment_id, variant, order_number, name, description, trigger,
            owner_role, approver_roles, outputs, work_time_minutes, elapsed_time_minutes,
            wait_time_minutes, rework_frequency, risk_tags, source_citation_ids,
            capture_method, status, validated_by, validated_at, created_by
          ) VALUES (
            ${workspace.id}, ${assessment.id}, 'observed', ${i + 1}, ${stage.name},
            ${stage.description}, ${stage.trigger}, ${stage.suggestedOwnerRole},
            ${stage.riskTags.length > 0 ? [stage.suggestedOwnerRole] : []},
            ${stage.suggestedOutputs}, ${timing.work}, ${timing.elapsed}, ${timing.wait},
            ${timing.rework}, ${stage.riskTags}, ${[citation!.id]},
            'interview', 'operator_validated', ${operatorId}, now(), ${strategistId}
          )
        `;
      }

      // ── Inferred brand rules (§9.2 route: no guidelines supplied) ─────────
      const brandRules = [
        { category: 'tone', rule: 'Speak plainly and avoid superlatives.', count: 18 },
        {
          category: 'prohibited_language',
          rule: 'Never claim "zero downtime" or "100% uptime".',
          count: 22,
        },
        {
          category: 'proof_point',
          rule: 'Quote a measured recovery-time figure wherever a reliability claim is made.',
          count: 14,
        },
        {
          category: 'message_pillar',
          rule: 'Recovery speed is the lead pillar, ahead of price.',
          count: 16,
        },
        {
          category: 'content_dont',
          rule: 'Do not compare directly against a named competitor.',
          count: 9,
        },
      ] as const;

      for (const rule of brandRules) {
        await tx`
          INSERT INTO brand_rules (
            workspace_id, assessment_id, category, rule, origin, evidence_count,
            source_citation_ids, confidence, status, created_by
          ) VALUES (
            ${workspace.id}, ${assessment.id}, ${rule.category}::brand_rule_category, ${rule.rule},
            'campaign_inference', ${rule.count}, ${[citation!.id]},
            ${Math.min(0.95, rule.count / 25)}, 'pending', ${strategistId}
          )
        `;
      }

      // ── Opportunities, scored by the real §11 engine ──────────────────────
      let recommendedAssigned = false;
      for (const seed of NORTHSTAR_OPPORTUNITIES) {
        const hardStops = seed.hardStopContext ? detectHardStops(seed.hardStopContext) : [];
        const score = calculateOpportunityScore({
          factors: factorSet(seed.factors, seed.fallback),
          confidence: seed.confidence,
          hardStops,
          calculatedAt: FIXTURE_CALCULATED_AT,
        });

        const isRecommended = !recommendedAssigned && score.priorityBand === 'recommend';
        if (isRecommended) recommendedAssigned = true;

        const [opportunity] = await tx<{ id: string }[]>`
          INSERT INTO opportunities (
            workspace_id, assessment_id, analysis_version, name, outcome, trigger,
            agent_actions, human_gates, value_hypothesis, owner_role, kpi,
            source_citation_ids, hard_stops_json, strategist_status, shared_with_client, created_by
          ) VALUES (
            ${workspace.id}, ${assessment.id}, 1, ${seed.name}, ${seed.outcome},
            'Campaign brief approved', ${seed.agentActions}, ${seed.humanGates},
            ${seed.valueHypothesis}, ${seed.ownerRole}, ${seed.kpi},
            ${[citation!.id]}, ${tx.json(score.hardStops)},
            ${isRecommended ? 'recommended' : score.priorityBand === 'blocked' ? 'rejected' : 'shortlisted'}::strategist_status,
            false, ${strategistId}
          ) RETURNING id
        `;

        await tx`
          INSERT INTO opportunity_scores (
            workspace_id, assessment_id, opportunity_id, score_version, factor_version,
            factors_json, raw_score, confidence_score, confidence_multiplier,
            priority_score, priority_band, hard_stops_json, calculated_by, calculated_at
          ) VALUES (
            ${workspace.id}, ${assessment.id}, ${opportunity!.id}, 1, ${score.factorVersion},
            ${tx.json(score.factors)}, ${score.rawScore}, ${score.confidenceScore},
            ${score.confidenceMultiplier}, ${score.priorityScore}, ${score.priorityBand}::priority_band,
            ${tx.json(score.hardStops)}, ${strategistId}, ${score.calculatedAt}
          )
        `;

        // §29: one candidate must carry no cost data at all, so the report has
        // to demonstrate the "never invent a missing value" behaviour.
        if (!seed.missingCost) {
          await tx`
            INSERT INTO business_cases (
              workspace_id, assessment_id, opportunity_id, currency, scenarios_json,
              assumptions_json, headcount_reduction_confirmed, created_by
            ) VALUES (
              ${workspace.id}, ${assessment.id}, ${opportunity!.id}, 'INR',
              ${tx.json({ base: BASE_SCENARIO })},
              ${tx.json([
                {
                  key: 'loadedHourlyCost',
                  label: 'Loaded hourly cost',
                  value: BASE_SCENARIO.loadedHourlyCost,
                  unit: 'INR/hour',
                  origin: 'strategist_estimate',
                  source: 'Client-supplied agency rate card, Day 1',
                  confidence: 'medium',
                },
              ])},
              false, ${strategistId}
            )
          `;
        }

        await tx`
          INSERT INTO audit_events (
            workspace_id, assessment_id, actor_user_id, actor_type, action,
            subject_type, subject_id, after_json
          ) VALUES (
            ${workspace.id}, ${assessment.id}, ${strategistId}, 'system', 'analysis_version_created',
            'opportunity', ${opportunity!.id},
            ${tx.json({ priorityBand: score.priorityBand, priorityScore: score.priorityScore })}
          )
        `;
      }

      console.log('Seeded workspace', workspace.id);
      console.log('Seeded assessment', assessment.id);
    });

    const [counts] = await sql<
      {
        campaigns: string;
        opportunities: string;
        stages: string;
        rules: string;
        observations: string;
      }[]
    >`
      SELECT
        (SELECT count(*) FROM campaigns)               AS campaigns,
        (SELECT count(*) FROM opportunities)           AS opportunities,
        (SELECT count(*) FROM workflow_stages)         AS stages,
        (SELECT count(*) FROM brand_rules)             AS rules,
        (SELECT count(*) FROM competitor_observations) AS observations
    `;

    console.log('\nNorthstar Cloud fixture ready (§29):');
    console.log(`  campaigns              ${counts?.campaigns}`);
    console.log(`  workflow stages        ${counts?.stages}`);
    console.log(`  inferred brand rules   ${counts?.rules}`);
    console.log(`  competitor evidence    ${counts?.observations}`);
    console.log(`  opportunities          ${counts?.opportunities}`);

    const scores = await sql<{ name: string; priority_score: string; priority_band: string }[]>`
      SELECT o.name, s.priority_score, s.priority_band
      FROM opportunities o
      JOIN opportunity_scores s ON s.opportunity_id = o.id
      ORDER BY (s.priority_band = 'blocked'), s.priority_score DESC
    `;
    console.log('\nScored portfolio:');
    for (const row of scores) {
      console.log(
        `  ${row.priority_score.padStart(6)}  ${row.priority_band.padEnd(12)} ${row.name}`,
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => reportFailure('Seed failed', error));
