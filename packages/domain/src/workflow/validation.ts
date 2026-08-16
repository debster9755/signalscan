import {
  APPROVER_REQUIRED_TAGS,
  type StageIssue,
  type WorkflowStage,
  type WorkflowValidationResult,
} from './types.js';

/**
 * Workflow validation — PRD §8.4.
 *
 * The rule that matters most here is the second one: "The sponsor alone cannot
 * certify the flow." A sponsor describes the process they believe exists; only
 * someone who does the work knows what actually happens. Letting a sponsor
 * sign off produces a tidy map that no operator recognises, and every downstream
 * opportunity inherits that fiction.
 */

export const MIN_STAGES = 4;
export const MAX_STAGES = 15;

/** Roles that count as hands-on for the purposes of §8.4 validation. */
export type ValidatorRole = 'operator' | 'strategist' | 'sponsor' | 'reviewer';

export interface ValidationActor {
  userId: string;
  role: ValidatorRole;
}

const issue = (stage: WorkflowStage, code: StageIssue['code'], message: string): StageIssue => ({
  stageId: stage.id,
  stageName: stage.name,
  code,
  message,
});

function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim().length === 0;
}

/**
 * Validates a whole map. Returns every problem rather than the first, so an
 * operator can fix the flow in one pass instead of one round trip per stage.
 */
export function validateWorkflow(
  stages: WorkflowStage[],
  validators: ValidationActor[] = [],
): WorkflowValidationResult {
  const issues: StageIssue[] = [];

  if (stages.length < MIN_STAGES) {
    issues.push({
      stageId: '',
      stageName: '',
      code: 'too_few_stages',
      message: `A campaign flow needs at least ${MIN_STAGES} stages; found ${stages.length}.`,
    });
  }
  if (stages.length > MAX_STAGES) {
    issues.push({
      stageId: '',
      stageName: '',
      code: 'too_many_stages',
      message: `A campaign flow may have at most ${MAX_STAGES} stages; found ${stages.length}.`,
    });
  }

  const seenOrders = new Set<number>();
  const unknownDurationStageIds: string[] = [];

  for (const stage of stages) {
    if (seenOrders.has(stage.order)) {
      issues.push(issue(stage, 'duplicate_order', `Two stages share order ${stage.order}.`));
    }
    seenOrders.add(stage.order);

    // §8.4: "Require an owner and output for every stage."
    if (isBlank(stage.ownerRole)) {
      issues.push(issue(stage, 'missing_owner', 'Every stage needs an owner role.'));
    }
    if (stage.outputs.length === 0 || stage.outputs.every(isBlank)) {
      issues.push(issue(stage, 'missing_output', 'Every stage needs at least one named output.'));
    }

    // §8.4: "Require an approver for any stage tagged brand, legal, privacy or
    // regulated_claim." These are exactly the stages where an unreviewed
    // agentic workflow would do real damage.
    const controlledTags = stage.riskTags.filter((tag) => APPROVER_REQUIRED_TAGS.includes(tag));
    if (controlledTags.length > 0 && stage.approverRoles.filter((r) => !isBlank(r)).length === 0) {
      issues.push(
        issue(
          stage,
          'missing_approver_for_risk_tag',
          `Stages tagged ${controlledTags.join(', ')} need a named approver.`,
        ),
      );
    }

    // §8.4: "Work time must not exceed elapsed time."
    if (
      stage.workTimeMinutes !== undefined &&
      stage.elapsedTimeMinutes !== undefined &&
      stage.workTimeMinutes > stage.elapsedTimeMinutes
    ) {
      issues.push(
        issue(
          stage,
          'work_exceeds_elapsed',
          `Work time (${stage.workTimeMinutes}m) cannot exceed elapsed time (${stage.elapsedTimeMinutes}m).`,
        ),
      );
    }

    // §8.4: unknown durations are valid, but they cost evidence confidence.
    if (stage.elapsedTimeMinutes === undefined) {
      unknownDurationStageIds.push(stage.id);
    }
  }

  const operatorValidated = validators.some((v) => v.role === 'operator');
  const durationCoverage =
    stages.length === 0 ? 0 : (stages.length - unknownDurationStageIds.length) / stages.length;

  return {
    valid: issues.length === 0,
    issues,
    operatorValidated,
    unknownDurationStageIds,
    durationCoverage: Math.round(durationCoverage * 1000) / 1000,
  };
}

export interface CertificationResult {
  certified: boolean;
  reason: string;
}

/**
 * §8.4: at least one hands-on operator must validate the map, and the sponsor
 * alone cannot certify it.
 */
export function canCertifyFlow(
  validators: ValidationActor[],
  validation: WorkflowValidationResult,
): CertificationResult {
  if (!validation.valid) {
    return {
      certified: false,
      reason: `The map has ${validation.issues.length} unresolved issue(s).`,
    };
  }

  const hasOperator = validators.some((v) => v.role === 'operator');
  if (!hasOperator) {
    const roles = [...new Set(validators.map((v) => v.role))];
    return {
      certified: false,
      reason:
        roles.length === 0
          ? 'Nobody has validated this flow yet. A hands-on operator must confirm it.'
          : `Validated by ${roles.join(', ')} only. A hands-on operator must confirm the flow — a sponsor cannot certify it alone (§8.4).`,
    };
  }

  return { certified: true, reason: 'A hands-on operator has validated the flow.' };
}

export interface FlowDifference {
  stageName: string;
  presentIn: 'documented_only' | 'observed_only' | 'both';
  detail: string;
}

/**
 * §8.4: "Show documented flow and observed flow separately when they differ."
 *
 * The gap between the two is frequently the single most useful output of the
 * Day 2 walkthrough, so it gets surfaced rather than reconciled away.
 */
export function compareFlows(
  documented: WorkflowStage[],
  observed: WorkflowStage[],
): { differ: boolean; differences: FlowDifference[] } {
  const normalise = (name: string) => name.trim().toLowerCase();
  const documentedNames = new Map(documented.map((s) => [normalise(s.name), s]));
  const observedNames = new Map(observed.map((s) => [normalise(s.name), s]));

  const differences: FlowDifference[] = [];

  for (const [key, stage] of documentedNames) {
    if (!observedNames.has(key)) {
      differences.push({
        stageName: stage.name,
        presentIn: 'documented_only',
        detail: 'Documented in the process but not observed in the real campaign.',
      });
    }
  }

  for (const [key, stage] of observedNames) {
    if (!documentedNames.has(key)) {
      differences.push({
        stageName: stage.name,
        presentIn: 'observed_only',
        detail: 'Happens in practice but is not in the documented process.',
      });
    }
  }

  for (const [key, documentedStage] of documentedNames) {
    const observedStage = observedNames.get(key);
    if (!observedStage) continue;
    if (documentedStage.order !== observedStage.order) {
      differences.push({
        stageName: documentedStage.name,
        presentIn: 'both',
        detail: `Runs at position ${observedStage.order} in practice but ${documentedStage.order} on paper.`,
      });
    }
  }

  return { differ: differences.length > 0, differences };
}
