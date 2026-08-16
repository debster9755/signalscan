/**
 * Campaign-flow mapping — PRD §8.
 *
 * All three capture paths in §8.1 (template, evidence, interview) produce the
 * same normalised `WorkflowStage`. That is the whole point: the client picks
 * whichever route is easiest for them, and downstream scoring sees one shape.
 */

export type CaptureMethod = 'template' | 'evidence' | 'interview' | 'manual';

/**
 * §8.4: a stage is only trustworthy once a hands-on operator has confirmed it.
 * A model proposal is `draft` until a human moves it.
 */
export type StageStatus = 'draft' | 'operator_validated' | 'strategist_validated';

export type ReworkFrequency =
  'never' | 'rare' | 'sometimes' | 'often' | 'almost_always' | 'unknown';

/** Tags that force an approver to exist on the stage (§8.4). */
export type RiskTag = 'brand' | 'legal' | 'privacy' | 'regulated_claim' | string;

export const APPROVER_REQUIRED_TAGS: readonly string[] = Object.freeze([
  'brand',
  'legal',
  'privacy',
  'regulated_claim',
]);

export interface WorkflowStage {
  id: string;
  assessmentId: string;
  order: number;
  name: string;
  description?: string;
  trigger: string;
  inputAssetIds: string[];
  ownerRole: string;
  contributorRoles: string[];
  approverRoles: string[];
  toolNames: string[];
  actions: string[];
  outputs: string[];
  /** Hands-on effort. Must never exceed elapsed time (§8.4). */
  workTimeMinutes?: number;
  /** Wall-clock time from stage start to stage end. */
  elapsedTimeMinutes?: number;
  /** Time spent waiting rather than working. */
  waitTimeMinutes?: number;
  reworkFrequency?: ReworkFrequency;
  reworkReasons: string[];
  riskTags: RiskTag[];
  sourceCitationIds: string[];
  captureMethod: CaptureMethod;
  status: StageStatus;
  validatedBy?: string;
  validatedAt?: string;
}

/**
 * §8.4: "Show documented flow and observed flow separately when they differ."
 * A process document and what the team actually does are different artefacts,
 * and collapsing them hides the most valuable finding in the whole exercise.
 */
export type FlowVariant = 'documented' | 'observed';

export interface WorkflowMap {
  assessmentId: string;
  variant: FlowVariant;
  stages: WorkflowStage[];
}

export interface StageIssue {
  stageId: string;
  stageName: string;
  code:
    | 'missing_owner'
    | 'missing_output'
    | 'missing_approver_for_risk_tag'
    | 'work_exceeds_elapsed'
    | 'duplicate_order'
    | 'too_few_stages'
    | 'too_many_stages';
  message: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  issues: StageIssue[];
  /** True once at least one hands-on operator has validated the map (§8.4). */
  operatorValidated: boolean;
  /** Stages with unknown durations — valid, but they reduce evidence confidence. */
  unknownDurationStageIds: string[];
  /** 0–1, feeding the §11.4 evidence-coverage component. */
  durationCoverage: number;
}
