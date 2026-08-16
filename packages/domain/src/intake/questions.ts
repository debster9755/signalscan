import type { QuestionDefinition } from './types.js';

/**
 * The twenty guided-intake questions — PRD §7.2, transcribed.
 *
 * Everything here is data. The wording, options, limits and "used by" trace all
 * come from the specification; if the product wants a different question, that
 * is a new version of the definition, not an edit to this one (§7.3, §17.1).
 */

export const QUESTION_SET_VERSION = 1;

/** §7.1: the intake is advertised to the client as a 25–35 minute exercise. */
export const ESTIMATED_COMPLETION_MINUTES = Object.freeze({ min: 25, max: 35 });

export const QUESTIONS: readonly QuestionDefinition[] = Object.freeze([
  // ─── Group: business ───────────────────────────────────────────────────────
  {
    id: 'business.priority_outcome',
    version: 1,
    group: 'business',
    order: 1,
    label: 'What business or marketing outcome matters most in the next 6-12 months?',
    answerType: 'multi_select',
    required: true,
    allowUnknown: false,
    minSelections: 1,
    maxSelections: 2,
    options: [
      { value: 'revenue_pipeline', label: 'Revenue / pipeline' },
      { value: 'launch_success', label: 'Launch success' },
      { value: 'awareness', label: 'Awareness' },
      { value: 'engagement', label: 'Engagement' },
      { value: 'conversion', label: 'Conversion' },
      { value: 'retention', label: 'Retention' },
      { value: 'efficiency', label: 'Efficiency' },
      { value: 'other', label: 'Other', requiresExplanation: true },
    ],
    validationSchema: { selections: { min: 1, max: 2 }, otherText: { min: 3, max: 200 } },
    usedBy: ['business_value_scoring', 'report_summary'],
  },
  {
    id: 'business.focus_scope',
    version: 1,
    group: 'business',
    order: 2,
    label: 'Which product, market and audience should this assessment focus on?',
    helpText: 'One focused scope produces a better first use case than a broad one.',
    answerType: 'structured_object',
    required: true,
    allowUnknown: false,
    validationSchema: {
      fields: {
        product: { required: true, min: 2, max: 200 },
        market: { required: true, min: 2, max: 200 },
        primaryAudience: { required: true, min: 2, max: 200 },
        secondaryAudience: { required: false, min: 2, max: 200 },
      },
    },
    usedBy: ['evidence_filtering', 'competitor_relevance', 'report_context'],
  },
  {
    id: 'business.campaign_type',
    version: 1,
    group: 'business',
    order: 3,
    label: 'Which campaign type is most frequent, costly or strategically important?',
    answerType: 'ranked_select',
    required: true,
    allowUnknown: false,
    minSelections: 1,
    maxSelections: 3,
    options: [
      { value: 'product_launch', label: 'Product launch' },
      { value: 'demand_generation', label: 'Demand generation' },
      { value: 'always_on_content', label: 'Always-on content' },
      { value: 'event', label: 'Event' },
      { value: 'nurture', label: 'Nurture' },
      { value: 'brand_campaign', label: 'Brand campaign' },
      { value: 'employer_brand', label: 'Employer brand' },
      { value: 'partner_marketing', label: 'Partner marketing' },
      { value: 'other', label: 'Other', requiresExplanation: true },
    ],
    validationSchema: { ranked: { min: 1, max: 3, distinct: true } },
    usedBy: ['workflow_template', 'use_case_generation'],
  },
  {
    id: 'business.success_measure',
    version: 1,
    group: 'business',
    order: 4,
    label: 'How will leadership decide whether a pilot succeeded?',
    helpText: '"Not currently measured" is a valid and useful answer.',
    answerType: 'structured_object',
    required: true,
    allowUnknown: true,
    validationSchema: {
      fields: {
        kpiName: { required: true, min: 2, max: 200 },
        currentBaseline: { required: false, nullable: true, type: 'number' },
        unit: { required: false, max: 50 },
        measurementSource: { required: false, max: 200 },
        measurementOwner: { required: false, max: 200 },
        notCurrentlyMeasured: { type: 'boolean' },
      },
    },
    usedBy: ['business_case', 'pilot_charter', 'adoption_scoring'],
  },

  // ─── Group: flow ───────────────────────────────────────────────────────────
  {
    id: 'flow.trigger',
    version: 1,
    group: 'flow',
    order: 5,
    label: 'Where does a campaign request begin, and what normally triggers it?',
    answerType: 'single_select',
    required: true,
    allowUnknown: false,
    options: [
      { value: 'request_form', label: 'Request form' },
      { value: 'sales_need', label: 'Sales need' },
      { value: 'product_roadmap', label: 'Product roadmap' },
      { value: 'content_calendar', label: 'Content calendar' },
      { value: 'leadership_request', label: 'Leadership request' },
      { value: 'agency_recommendation', label: 'Agency recommendation' },
      { value: 'other', label: 'Other', requiresExplanation: true },
    ],
    validationSchema: { note: { required: false, max: 500 } },
    usedBy: ['first_workflow_stage'],
  },
  {
    id: 'flow.stages',
    version: 1,
    group: 'flow',
    order: 6,
    label: 'What are the major steps from request to launch?',
    helpText: 'Start from a template, then rename, reorder, add or remove stages.',
    answerType: 'workflow_builder',
    required: true,
    allowUnknown: false,
    minSelections: 4,
    maxSelections: 15,
    validationSchema: { stages: { min: 4, max: 15, nameMin: 2, nameMax: 120 } },
    usedBy: ['current_state_map', 'opportunity_mapping'],
  },
  {
    id: 'flow.roles',
    version: 1,
    group: 'flow',
    order: 7,
    label: 'Who owns, contributes to and approves each major stage?',
    helpText: 'Use role names rather than personal names wherever you can (§22.3).',
    answerType: 'structured_list',
    required: true,
    allowUnknown: false,
    validationSchema: {
      rows: {
        stageId: { required: true },
        ownerRole: { required: true, min: 2, max: 120 },
        contributorRoles: { type: 'array', required: false },
        approverRole: { required: false, max: 120 },
      },
    },
    usedBy: ['feasibility', 'adoption', 'pilot_charter'],
  },
  {
    id: 'flow.slowest_stages',
    version: 1,
    group: 'flow',
    order: 8,
    label: 'Which three stages consume the most elapsed time?',
    // §7.2 calls this "rank stages plus duration range". Each row pairs a stage
    // from Q06 with a duration band, so the value is a list of composite rows
    // rather than a flat ranking — `options` below are the permitted bands.
    answerType: 'structured_list',
    required: true,
    allowUnknown: true,
    minSelections: 1,
    maxSelections: 3,
    options: [
      { value: 'lt_1_day', label: 'Less than 1 day' },
      { value: '1_3_days', label: '1-3 days' },
      { value: '4_7_days', label: '4-7 days' },
      { value: '8_14_days', label: '8-14 days' },
      { value: '15_plus_days', label: '15+ days' },
      { value: 'unknown', label: 'Unknown' },
    ],
    validationSchema: {
      rows: {
        stageId: { required: true },
        durationRange: { required: true, enum: true },
      },
      minRows: 1,
      maxRows: 3,
      distinctBy: 'stageId',
    },
    usedBy: ['cycle_time_opportunity', 'baseline'],
  },
  {
    id: 'flow.rework',
    version: 1,
    group: 'flow',
    order: 9,
    label: 'Where do work, approvals or information most often get sent back?',
    // "Stage multi-select plus reason" — each selected stage carries its own
    // reasons, so this is a list of rows, not a flat selection.
    answerType: 'structured_list',
    required: true,
    allowUnknown: false,
    minSelections: 1,
    options: [
      { value: 'unclear_brief', label: 'Unclear brief' },
      { value: 'missing_evidence', label: 'Missing evidence' },
      { value: 'brand', label: 'Brand' },
      { value: 'legal', label: 'Legal' },
      { value: 'stakeholder_alignment', label: 'Stakeholder alignment' },
      { value: 'quality', label: 'Quality' },
      { value: 'capacity', label: 'Capacity' },
      { value: 'other', label: 'Other', requiresExplanation: true },
    ],
    validationSchema: {
      rows: {
        stageId: { required: true },
        reasons: { required: true, type: 'array', minItems: 1, enum: true },
      },
      minRows: 1,
      distinctBy: 'stageId',
    },
    usedBy: ['friction_map', 'risk_and_value_scoring'],
  },
  {
    id: 'flow.repeated_work',
    version: 1,
    group: 'flow',
    order: 10,
    label: 'What work is repeated across campaigns or channels?',
    answerType: 'multi_select',
    required: true,
    allowUnknown: false,
    minSelections: 1,
    options: [
      { value: 'research', label: 'Research' },
      { value: 'briefing', label: 'Briefing' },
      { value: 'variants', label: 'Variants' },
      { value: 'resizing', label: 'Resizing' },
      { value: 'localization', label: 'Localization' },
      { value: 'claims_checking', label: 'Claims checking' },
      { value: 'reporting', label: 'Reporting' },
      { value: 'repurposing', label: 'Repurposing' },
      { value: 'tagging', label: 'Tagging' },
      { value: 'other', label: 'Other', requiresExplanation: true },
    ],
    validationSchema: { selections: { min: 1 } },
    usedBy: ['repeatability', 'use_case_generation'],
  },

  // ─── Group: data ───────────────────────────────────────────────────────────
  {
    id: 'data.systems',
    version: 1,
    group: 'data',
    order: 11,
    label: 'Which tools contain briefs, assets, approvals, audience data and performance results?',
    answerType: 'structured_list',
    required: true,
    allowUnknown: false,
    minSelections: 1,
    options: [
      { value: 'available', label: 'Available' },
      { value: 'available_with_approval', label: 'Available with approval' },
      { value: 'unavailable', label: 'Unavailable' },
      { value: 'unknown', label: 'Unknown' },
    ],
    validationSchema: {
      rows: {
        toolName: { required: true, min: 1, max: 200 },
        dataType: { required: true, min: 1, max: 200 },
        ownerRole: { required: true, min: 1, max: 200 },
        accessStatus: { required: true, enum: true },
      },
      minRows: 1,
    },
    usedBy: ['feasibility', 'pilot_dependency'],
  },
  {
    id: 'data.quality',
    version: 1,
    group: 'data',
    order: 12,
    label: 'How accessible and reliable is the information needed at each stage?',
    helpText: '1 = unusable or unavailable; 5 = consistently ready.',
    answerType: 'rating_matrix',
    required: true,
    allowUnknown: false,
    validationSchema: {
      ratings: {
        findability: { min: 1, max: 5 },
        completeness: { min: 1, max: 5 },
        structure: { min: 1, max: 5 },
        freshness: { min: 1, max: 5 },
      },
    },
    usedBy: ['input_availability_score', 'confidence'],
  },
  {
    id: 'data.monthly_volume',
    version: 1,
    group: 'data',
    order: 13,
    label: 'What volume does the team handle in a normal month?',
    answerType: 'numeric_range',
    required: true,
    allowUnknown: true,
    validationSchema: {
      fields: ['campaigns', 'briefs', 'channels', 'masterAssets', 'variants', 'markets'],
      min: 0,
      nullable: true,
    },
    usedBy: ['frequency', 'business_case', 'load_estimates'],
  },
  {
    id: 'data.current_cost',
    version: 1,
    group: 'data',
    order: 14,
    label: 'What does the current workflow roughly cost?',
    helpText: 'Rough ranges are fine. Unknown is fine. Values are never invented (§12.1).',
    answerType: 'numeric_range',
    required: false,
    allowUnknown: true,
    options: [
      { value: 'low', label: 'Low confidence' },
      { value: 'medium', label: 'Medium confidence' },
      { value: 'high', label: 'High confidence' },
    ],
    validationSchema: {
      fields: [
        'internalHours',
        'agencyCost',
        'freelancerCost',
        'reworkCost',
        'delayedLaunchImpact',
      ],
      min: 0,
      nullable: true,
      confidence: { enum: ['low', 'medium', 'high'] },
    },
    usedBy: ['roi_model'],
  },

  // ─── Group: brand ──────────────────────────────────────────────────────────
  {
    id: 'brand.guidelines_available',
    version: 1,
    group: 'brand',
    order: 15,
    label: 'Do approved brand guidelines exist, and can they be uploaded?',
    helpText:
      'If none exist, we infer a brand operating guide from roughly 25 recent campaigns instead (§9.2).',
    answerType: 'single_select',
    required: true,
    allowUnknown: true,
    options: [
      { value: 'yes', label: 'Yes, and they are available' },
      { value: 'partial', label: 'Partial or outdated' },
      { value: 'no', label: 'No' },
      { value: 'unknown', label: 'Unknown' },
    ],
    validationSchema: { enum: ['yes', 'partial', 'no', 'unknown'] },
    usedBy: ['brand_analysis_route'],
  },
  {
    id: 'brand.examples',
    version: 1,
    group: 'brand',
    order: 16,
    label: 'Which recent campaigns best represent on-brand and off-brand work?',
    helpText: 'At least one on-brand example is required. Off-brand examples can be unavailable.',
    answerType: 'asset_selector',
    required: true,
    allowUnknown: false,
    validationSchema: {
      onBrand: { minItems: 1, explanationMax: 1000 },
      offBrand: { minItems: 0, explanationMax: 1000 },
    },
    usedBy: ['brand_rule_validation', 'negative_examples'],
  },
  {
    id: 'brand.competitors',
    version: 1,
    group: 'brand',
    order: 17,
    label: 'Who are the two most relevant competitors, and where must the brand be different?',
    helpText: 'Exactly two. More dilutes the comparison; fewer makes it anecdotal (§9.3).',
    answerType: 'structured_list',
    required: true,
    allowUnknown: false,
    minSelections: 2,
    maxSelections: 2,
    validationSchema: {
      exactly: 2,
      rows: {
        name: { required: true, min: 1, max: 200 },
        officialUrl: { required: true, format: 'https-url' },
        socialOrCampaignUrl: { required: false, format: 'https-url' },
        commercialRationale: { required: true, min: 10, max: 1000 },
        desiredDifference: { required: false, max: 1000 },
      },
      requiresConfirmation: true,
    },
    usedBy: ['competitive_comparison'],
  },

  // ─── Group: risk ───────────────────────────────────────────────────────────
  {
    id: 'risk.controls',
    version: 1,
    group: 'risk',
    order: 18,
    label: 'Which content, claims, audiences or data require special control?',
    answerType: 'multi_select',
    required: true,
    allowUnknown: false,
    minSelections: 1,
    options: [
      { value: 'regulated_claims', label: 'Regulated claims' },
      { value: 'confidential_data', label: 'Confidential data' },
      { value: 'personal_data', label: 'Personal data' },
      { value: 'vulnerable_audiences', label: 'Vulnerable audiences' },
      { value: 'market_restrictions', label: 'Market restrictions' },
      { value: 'channel_restrictions', label: 'Channel restrictions' },
      { value: 'no_known_restrictions', label: 'No known restrictions' },
      { value: 'other', label: 'Other', requiresExplanation: true },
    ],
    validationSchema: {
      selections: { min: 1 },
      exclusive: ['no_known_restrictions'],
      notes: { max: 2000 },
    },
    usedBy: ['risk_safety', 'hard_stops'],
  },
  {
    id: 'risk.ai_policy',
    version: 1,
    group: 'risk',
    order: 19,
    label: 'What AI tools or policies already exist, and what is prohibited?',
    answerType: 'structured_object',
    required: true,
    allowUnknown: true,
    validationSchema: {
      fields: {
        approvedTools: { type: 'array' },
        prohibitedTools: { type: 'array' },
        modelRestrictions: { max: 2000 },
        retentionRules: { max: 2000 },
        ipTerms: { max: 2000 },
        humanReviewRules: { max: 2000 },
        priorPilots: { max: 2000 },
      },
    },
    usedBy: ['feasibility', 'risk', 'technical_pilot_plan'],
  },
  {
    id: 'risk.pilot_roles',
    version: 1,
    group: 'risk',
    order: 20,
    label: 'Who will own, use and approve the first pilot?',
    helpText:
      'Sponsor, workflow owner and daily user are mandatory before the assessment can be finalised.',
    answerType: 'structured_object',
    required: true,
    allowUnknown: false,
    validationSchema: {
      fields: {
        executiveSponsor: { required: true, min: 2, max: 200 },
        workflowOwner: { required: true, min: 2, max: 200 },
        dailyUser: { required: true, min: 2, max: 200 },
        brandLegalReviewer: { required: false, max: 200 },
        technicalContact: { required: false, max: 200 },
      },
      mandatoryBeforeFinalisation: ['executiveSponsor', 'workflowOwner', 'dailyUser'],
    },
    usedBy: ['adoption_score', 'pilot_charter'],
  },
]);

const BY_ID: ReadonlyMap<string, QuestionDefinition> = new Map(QUESTIONS.map((q) => [q.id, q]));

export function getQuestion(id: string): QuestionDefinition | undefined {
  return BY_ID.get(id);
}

export function questionsInGroup(group: QuestionDefinition['group']): QuestionDefinition[] {
  return QUESTIONS.filter((q) => q.group === group).sort((a, b) => a.order - b.order);
}

export const QUESTION_IDS: readonly string[] = Object.freeze(QUESTIONS.map((q) => q.id));

/**
 * §7.2 Q15 drives which brand-analysis route the assessment takes: the
 * guideline-extraction route (§9.1) or the ~25-campaign inference route (§9.2).
 */
export type BrandRoute = 'guideline_extraction' | 'campaign_inference' | 'undetermined';

export function resolveBrandRoute(guidelinesAvailable: unknown): BrandRoute {
  if (guidelinesAvailable === 'yes' || guidelinesAvailable === 'partial') {
    return 'guideline_extraction';
  }
  if (guidelinesAvailable === 'no') return 'campaign_inference';
  return 'undetermined';
}

/**
 * Structural guard: the specification defines twenty questions across five
 * groups with contiguous ordering. A duplicate id or a gap in the order means
 * the UI silently skips a question, so this fails at import.
 */
function assertQuestionSetIsWellFormed(): void {
  if (QUESTIONS.length !== 20) {
    throw new Error(`Intake question set must contain 20 questions, found ${QUESTIONS.length}.`);
  }
  const ids = QUESTIONS.map((q) => q.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Intake question set contains duplicate question ids.');
  }
  const orders = QUESTIONS.map((q) => q.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i += 1) {
    if (orders[i] !== i + 1) {
      throw new Error(
        `Intake question order is not contiguous: expected ${i + 1}, got ${orders[i]}.`,
      );
    }
  }
}

assertQuestionSetIsWellFormed();
