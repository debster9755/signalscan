import type { ResponseMap } from './types.js';

/**
 * A complete, valid intake for the synthetic Northstar Cloud client (§29).
 *
 * Lives in `src` rather than in the test folder because the database seed and
 * the E2E fixtures both consume it — one canonical example beats three that
 * drift apart. Everything here is invented; §29 forbids real client content in
 * committed fixtures.
 */
export function northstarIntakeResponses(overrides: ResponseMap = {}): ResponseMap {
  return {
    'business.priority_outcome': { selections: ['efficiency', 'launch_success'] },
    'business.focus_scope': {
      product: 'Northstar Vault — cloud backup for mid-market IT',
      market: 'India and South-East Asia',
      primaryAudience: 'IT infrastructure managers at 200-2000 seat companies',
      secondaryAudience: 'Finance approvers',
    },
    'business.campaign_type': { ranked: ['product_launch', 'demand_generation'] },
    'business.success_measure': {
      kpiName: 'Brief-to-launch cycle time',
      currentBaseline: 21,
      unit: 'days',
      measurementSource: 'Campaign planner export',
      measurementOwner: 'Marketing Operations Lead',
      notCurrentlyMeasured: false,
    },
    'flow.trigger': { value: 'request_form' },
    'flow.stages': {
      stages: [
        { name: 'Intake' },
        { name: 'Research' },
        { name: 'Brief' },
        { name: 'Strategy' },
        { name: 'Concept' },
        { name: 'Production' },
        { name: 'Brand review' },
        { name: 'Legal review' },
        { name: 'Launch' },
        { name: 'Measurement and learning' },
      ],
    },
    'flow.roles': {
      rows: [
        {
          stageId: 'brief',
          ownerRole: 'Marketing Operations Lead',
          contributorRoles: ['Product Marketing Manager'],
          approverRole: 'Head of Marketing',
        },
        {
          stageId: 'brand_review',
          ownerRole: 'Brand Manager',
          contributorRoles: [],
          approverRole: 'Brand Manager',
        },
      ],
    },
    'flow.slowest_stages': {
      rows: [
        { stageId: 'brand_review', durationRange: '4_7_days' },
        { stageId: 'legal_review', durationRange: '8_14_days' },
        { stageId: 'production', durationRange: '4_7_days' },
      ],
    },
    'flow.rework': {
      rows: [
        { stageId: 'brand_review', reasons: ['brand', 'unclear_brief'] },
        { stageId: 'legal_review', reasons: ['legal'] },
      ],
    },
    'flow.repeated_work': {
      selections: ['variants', 'resizing', 'localization', 'claims_checking'],
    },
    'data.systems': {
      rows: [
        {
          toolName: 'Northstar DAM',
          dataType: 'Master assets and variants',
          ownerRole: 'Brand Manager',
          accessStatus: 'available',
        },
        {
          toolName: 'Campaign Planner',
          dataType: 'Briefs and schedules',
          ownerRole: 'Marketing Operations Lead',
          accessStatus: 'available',
        },
        {
          toolName: 'Analytics Warehouse',
          dataType: 'Performance results',
          ownerRole: 'Data Analyst',
          accessStatus: 'available_with_approval',
        },
      ],
    },
    'data.quality': {
      ratings: { findability: 3, completeness: 3, structure: 2, freshness: 4 },
    },
    'data.monthly_volume': {
      values: { campaigns: 6, briefs: 12, channels: 4, masterAssets: 22, variants: 180, markets: 3 },
    },
    'data.current_cost': {
      values: {
        internalHours: 320,
        agencyCost: 450000,
        freelancerCost: null,
        reworkCost: 120000,
        delayedLaunchImpact: null,
      },
      confidence: 'medium',
    },
    // §9.2 route: no approved guidelines, so brand rules are inferred from
    // roughly 25 recent campaigns.
    'brand.guidelines_available': { value: 'no' },
    'brand.examples': {
      onBrand: ['campaign-004', 'campaign-011', 'campaign-019'],
      offBrand: ['campaign-007', 'campaign-022'],
    },
    'brand.competitors': {
      rows: [
        {
          name: 'Meridian Data',
          officialUrl: 'https://example.com/meridian-data',
          socialOrCampaignUrl: 'https://example.com/meridian-data/campaign',
          commercialRationale: 'Competes on the same mid-market backup deals in India.',
          desiredDifference: 'We must sound practical, not enterprise-corporate.',
        },
        {
          name: 'Kestrel Cloud',
          officialUrl: 'https://example.com/kestrel-cloud',
          commercialRationale: 'Wins on price in South-East Asia and sets category language.',
          desiredDifference: 'We must own reliability rather than cheapness.',
        },
      ],
    },
    'risk.controls': { selections: ['confidential_data', 'regulated_claims'], notes: 'Uptime claims need legal sign-off.' },
    'risk.ai_policy': {
      approvedTools: ['Internal assistant'],
      prohibitedTools: ['Public image generators'],
      modelRestrictions: 'No customer data may leave the approved region.',
      retentionRules: 'Provider retention must be disabled.',
      ipTerms: 'Output must be owned by Northstar.',
      humanReviewRules: 'All outbound copy is reviewed by a human.',
      priorPilots: 'One abandoned chatbot pilot in 2025.',
    },
    'risk.pilot_roles': {
      executiveSponsor: 'Head of Marketing',
      workflowOwner: 'Marketing Operations Lead',
      dailyUser: 'Content Producer',
      brandLegalReviewer: 'Brand Manager',
      technicalContact: 'IT Systems Analyst',
    },
    ...overrides,
  };
}
