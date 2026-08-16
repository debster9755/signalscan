import type { RiskTag } from './types';

/**
 * Capture Path A — templates (PRD §8.1).
 *
 * For clients with no process documentation, which is most of them. The client
 * picks a template, then reorders, renames, adds and removes stages; §8.4's
 * 4–15 stage bounds still apply to whatever they end up with.
 */

export interface TemplateStage {
  name: string;
  description: string;
  trigger: string;
  suggestedOwnerRole: string;
  suggestedOutputs: string[];
  riskTags: RiskTag[];
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  stages: TemplateStage[];
}

const stage = (
  name: string,
  description: string,
  trigger: string,
  suggestedOwnerRole: string,
  suggestedOutputs: string[],
  riskTags: RiskTag[] = [],
): TemplateStage => ({
  name,
  description,
  trigger,
  suggestedOwnerRole,
  suggestedOutputs,
  riskTags,
});

/** §8.2 — the ten default normalised stages every template maps onto. */
export const DEFAULT_NORMALIZED_STAGES: readonly string[] = Object.freeze([
  'Intake',
  'Research',
  'Brief',
  'Strategy',
  'Concept',
  'Production',
  'Brand / stakeholder review',
  'Legal / compliance',
  'Launch',
  'Measurement and learning',
]);

const GENERAL_CAMPAIGN_STAGES: TemplateStage[] = [
  stage(
    'Intake',
    'A campaign request arrives and is logged.',
    'Request submitted',
    'Marketing Operations',
    ['Logged request'],
  ),
  stage(
    'Research',
    'Audience, market and prior-campaign evidence is gathered.',
    'Request accepted',
    'Product Marketing',
    ['Research summary'],
  ),
  stage(
    'Brief',
    'The campaign brief is written and agreed.',
    'Research complete',
    'Product Marketing',
    ['Approved brief'],
  ),
  stage(
    'Strategy',
    'Channel mix, messaging and measurement are decided.',
    'Brief approved',
    'Marketing Lead',
    ['Channel plan', 'Measurement plan'],
  ),
  stage(
    'Concept',
    'Creative routes are developed and selected.',
    'Strategy agreed',
    'Creative Lead',
    ['Selected concept'],
  ),
  stage(
    'Production',
    'Master assets and channel variants are produced.',
    'Concept selected',
    'Studio',
    ['Master assets', 'Channel variants'],
  ),
  stage(
    'Brand / stakeholder review',
    'Work is checked against brand rules and stakeholder expectations.',
    'Assets drafted',
    'Brand Manager',
    ['Reviewed assets'],
    ['brand'],
  ),
  stage(
    'Legal / compliance',
    'Claims and regulatory constraints are checked.',
    'Brand review passed',
    'Legal Counsel',
    ['Compliance sign-off'],
    ['legal', 'regulated_claim'],
  ),
  stage(
    'Launch',
    'Assets are scheduled and published across channels.',
    'All approvals granted',
    'Marketing Operations',
    ['Live campaign'],
  ),
  stage(
    'Measurement and learning',
    'Results are collected and lessons recorded.',
    'Campaign live',
    'Data Analyst',
    ['Performance report', 'Learnings'],
  ),
];

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = Object.freeze([
  {
    key: 'general_campaign',
    name: 'General campaign',
    description: 'The ten normalised stages, suitable as a starting point for any campaign type.',
    stages: GENERAL_CAMPAIGN_STAGES,
  },
  {
    key: 'b2b_product_launch',
    name: 'B2B product launch',
    description: 'Adds sales enablement and launch readiness, which dominate B2B launch timelines.',
    stages: [
      ...GENERAL_CAMPAIGN_STAGES.slice(0, 6),
      stage(
        'Sales enablement',
        'Sales collateral, battlecards and training are prepared.',
        'Assets drafted',
        'Product Marketing',
        ['Enablement pack'],
      ),
      stage(
        'Brand / stakeholder review',
        'Work is checked against brand rules and stakeholder expectations.',
        'Enablement drafted',
        'Brand Manager',
        ['Reviewed assets'],
        ['brand'],
      ),
      stage(
        'Legal / compliance',
        'Product claims and contractual language are checked.',
        'Brand review passed',
        'Legal Counsel',
        ['Compliance sign-off'],
        ['legal', 'regulated_claim'],
      ),
      stage(
        'Launch readiness',
        'Go/no-go review across marketing, sales and support.',
        'Approvals granted',
        'Launch Manager',
        ['Go decision'],
      ),
      stage(
        'Launch',
        'Announcement and campaign go live.',
        'Go decision made',
        'Marketing Operations',
        ['Live launch'],
      ),
      stage(
        'Measurement and learning',
        'Pipeline and adoption impact is measured.',
        'Campaign live',
        'Data Analyst',
        ['Launch performance report'],
      ),
    ],
  },
  {
    key: 'demand_generation',
    name: 'Demand generation',
    description: 'Optimised for repeatable, high-frequency acquisition programmes.',
    stages: [
      stage(
        'Intake',
        'A demand target or gap triggers a programme.',
        'Pipeline gap identified',
        'Demand Generation Manager',
        ['Programme request'],
      ),
      stage(
        'Audience and offer',
        'Segment and offer are selected from prior performance.',
        'Request accepted',
        'Demand Generation Manager',
        ['Audience definition', 'Offer'],
      ),
      stage(
        'Brief',
        'The programme brief is written.',
        'Offer agreed',
        'Demand Generation Manager',
        ['Approved brief'],
      ),
      stage(
        'Production',
        'Ads, landing pages and nurture assets are produced.',
        'Brief approved',
        'Studio',
        ['Ad set', 'Landing page', 'Nurture emails'],
      ),
      stage(
        'Brand / stakeholder review',
        'Messaging and design are checked against brand rules.',
        'Assets drafted',
        'Brand Manager',
        ['Reviewed assets'],
        ['brand'],
      ),
      stage(
        'Legal / compliance',
        'Claims and data-capture wording are checked.',
        'Brand review passed',
        'Legal Counsel',
        ['Compliance sign-off'],
        ['legal', 'privacy'],
      ),
      stage(
        'Launch',
        'Programme goes live across paid and owned channels.',
        'Approvals granted',
        'Marketing Operations',
        ['Live programme'],
      ),
      stage(
        'Optimisation',
        'Creative and targeting are adjusted on performance.',
        'Programme live',
        'Demand Generation Manager',
        ['Optimisation log'],
      ),
      stage(
        'Measurement and learning',
        'Cost per opportunity and pipeline contribution are reported.',
        'Programme running',
        'Data Analyst',
        ['Performance report'],
      ),
    ],
  },
  {
    key: 'always_on_content',
    name: 'Always-on content',
    description: 'A recurring editorial cycle rather than a discrete campaign.',
    stages: [
      stage(
        'Calendar planning',
        'The editorial calendar is set for the period.',
        'Planning cycle starts',
        'Content Lead',
        ['Editorial calendar'],
      ),
      stage(
        'Research',
        'Topics, keywords and source material are gathered.',
        'Calendar agreed',
        'Content Strategist',
        ['Topic briefs'],
      ),
      stage(
        'Brief',
        'Individual pieces are briefed to writers.',
        'Topics selected',
        'Content Lead',
        ['Content briefs'],
      ),
      stage('Production', 'Content is drafted and designed.', 'Brief issued', 'Content Producer', [
        'Draft content',
      ]),
      stage(
        'Brand / stakeholder review',
        'Voice, tone and accuracy are checked.',
        'Draft complete',
        'Brand Manager',
        ['Reviewed content'],
        ['brand'],
      ),
      stage(
        'Legal / compliance',
        'Claims and third-party references are checked.',
        'Brand review passed',
        'Legal Counsel',
        ['Compliance sign-off'],
        ['legal'],
      ),
      stage(
        'Publish',
        'Content is scheduled and published.',
        'Approvals granted',
        'Marketing Operations',
        ['Published content'],
      ),
      stage(
        'Repurposing',
        'Content is adapted for other channels and formats.',
        'Content published',
        'Content Producer',
        ['Channel variants'],
      ),
      stage(
        'Measurement and learning',
        'Engagement and search performance are reviewed.',
        'Content live',
        'Data Analyst',
        ['Content performance report'],
      ),
    ],
  },
  {
    key: 'event_campaign',
    name: 'Event campaign',
    description: 'Pre-event, live and post-event phases with a hard, immovable deadline.',
    stages: [
      stage(
        'Intake',
        'An event is confirmed and a campaign is requested.',
        'Event confirmed',
        'Events Manager',
        ['Campaign request'],
      ),
      stage(
        'Strategy',
        'Goals, audience and the promotion plan are agreed.',
        'Request accepted',
        'Marketing Lead',
        ['Promotion plan'],
      ),
      stage(
        'Brief',
        'Creative and content requirements are briefed.',
        'Plan agreed',
        'Events Manager',
        ['Approved brief'],
      ),
      stage(
        'Production',
        'Pre-event, on-site and follow-up assets are produced.',
        'Brief approved',
        'Studio',
        ['Event asset kit'],
      ),
      stage(
        'Brand / stakeholder review',
        'Assets and stand design are checked against brand rules.',
        'Assets drafted',
        'Brand Manager',
        ['Reviewed assets'],
        ['brand'],
      ),
      stage(
        'Legal / compliance',
        'Partner logos, claims and data capture are checked.',
        'Brand review passed',
        'Legal Counsel',
        ['Compliance sign-off'],
        ['legal', 'privacy'],
      ),
      stage(
        'Pre-event promotion',
        'Registration drive runs across channels.',
        'Approvals granted',
        'Marketing Operations',
        ['Registrations'],
      ),
      stage(
        'Live event',
        'The event runs and content is captured.',
        'Event day',
        'Events Manager',
        ['Captured content', 'Attendee list'],
      ),
      stage(
        'Follow-up',
        'Attendees and no-shows are followed up.',
        'Event ends',
        'Demand Generation Manager',
        ['Follow-up sequence'],
      ),
      stage(
        'Measurement and learning',
        'Attendance, pipeline and cost per attendee are reported.',
        'Follow-up complete',
        'Data Analyst',
        ['Event performance report'],
      ),
    ],
  },
]);

const BY_KEY: ReadonlyMap<string, WorkflowTemplate> = new Map(
  WORKFLOW_TEMPLATES.map((t) => [t.key, t]),
);

export function getTemplate(key: string): WorkflowTemplate | undefined {
  return BY_KEY.get(key);
}

export const TEMPLATE_KEYS: readonly string[] = Object.freeze(WORKFLOW_TEMPLATES.map((t) => t.key));

/**
 * §8.1 requires templates to sit inside the 4–15 stage bounds so a client who
 * picks one and changes nothing still has a valid map.
 */
function assertTemplatesAreWellFormed(): void {
  for (const template of WORKFLOW_TEMPLATES) {
    if (template.stages.length < 4 || template.stages.length > 15) {
      throw new Error(
        `Workflow template "${template.key}" has ${template.stages.length} stages; §8.1 permits 4 to 15.`,
      );
    }
    for (const templateStage of template.stages) {
      if (templateStage.suggestedOutputs.length === 0) {
        throw new Error(
          `Workflow template "${template.key}" stage "${templateStage.name}" has no output; §8.4 requires one.`,
        );
      }
    }
  }
}

assertTemplatesAreWellFormed();
