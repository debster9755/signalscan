import type { HardStop, HardStopCode } from './types.js';

/**
 * Hard stops — PRD §11.6.
 *
 * A hard stop is not a low score. It is a statement that the workflow cannot be
 * the first pilot until something specific changes, and it overrides the
 * ranking entirely (§11.5: "Any score with hard stop → blocked").
 *
 * Every stop carries a `resolution` because a blocked opportunity that does not
 * tell the client what would unblock it is a dead end, not advice.
 */

export type SystemAccessStatus =
  'available' | 'available_with_approval' | 'unavailable' | 'prohibited' | 'unknown';

export interface RequiredSystemAccess {
  systemName: string;
  status: SystemAccessStatus;
}

export interface RequiredDependency {
  name: string;
  /** False when the client has said they cannot provide the integration or right. */
  clientCanProvide: boolean;
}

/**
 * Everything a hard-stop evaluation needs, assembled from intake answers
 * (§7.2 Q04, Q11, Q18, Q19, Q20), the validated workflow (§8) and the
 * candidate opportunity itself (§10.3).
 */
export interface HardStopContext {
  /** Q20 workflow owner. Null or blank means nobody is accountable. */
  accountableOwnerRole: string | null;
  /** Q20 daily user. */
  dailyUserRole: string | null;
  /** Q04 success measure. */
  measurableOutcome: {
    kpi: string | null;
    /** True when the client accepted a proxy measure in place of a real KPI. */
    proxyAccepted: boolean;
  };
  /** Q11 systems the opportunity actually needs. */
  requiredSystems: RequiredSystemAccess[];
  /** Q18 controlled content and Q07 approvers. */
  review: {
    brandReviewRequired: boolean;
    brandReviewerAvailable: boolean;
    legalReviewRequired: boolean;
    legalReviewerAvailable: boolean;
  };
  /** Q19 AI policy. */
  policy: {
    /** False when the client's AI policy forbids the model or data flow needed. */
    modelAndDataFlowPermitted: boolean;
    /** Free-text note carried into the report when the flow is not permitted. */
    restrictionNote: string | null;
  };
  /** Whether a wrong output would reach the market before a human sees it. */
  output: {
    highImpact: boolean;
    humanCheckBeforeRelease: boolean;
  };
  dependencies: RequiredDependency[];
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0;
}

const STOP_REASONS: Record<HardStopCode, { reason: string; resolution: string }> = {
  no_accountable_owner: {
    reason: 'No accountable owner is named for this workflow.',
    resolution: 'Name a workflow owner who is accountable for the pilot outcome.',
  },
  no_daily_user: {
    reason: 'No hands-on daily user is named.',
    resolution: 'Name the person or role who will use this workflow day to day.',
  },
  no_measurable_outcome: {
    reason: 'No measurable outcome or accepted proxy exists for this workflow.',
    resolution:
      'Agree a KPI with a baseline and a measurement source, or explicitly accept a proxy measure.',
  },
  required_data_prohibited: {
    reason: 'Data this workflow requires is prohibited or cannot be accessed.',
    resolution: 'Obtain access to the required systems, or redesign the workflow to avoid them.',
  },
  review_required_but_unavailable: {
    reason: 'Brand or legal review is required for this output but no reviewer is available.',
    resolution: 'Assign an available brand and legal reviewer with an agreed turnaround.',
  },
  policy_prohibits_model_or_data_flow: {
    reason: 'Client AI policy prohibits the model or data flow this workflow needs.',
    resolution:
      'Obtain a policy exception, or redesign the workflow to use an approved model and data path.',
  },
  output_uncheckable_before_release: {
    reason: 'High-impact output cannot be checked by a human before it is released.',
    resolution: 'Insert a human approval gate before release, or reduce the output impact.',
  },
  integration_or_right_unavailable: {
    reason: 'This workflow needs an integration or right the client cannot provide.',
    resolution: 'Secure the integration or usage right, or select a workflow without it.',
  },
};

function stop(code: HardStopCode, detail?: string): HardStop {
  const template = STOP_REASONS[code];
  return {
    code,
    reason: detail ? `${template.reason} ${detail}` : template.reason,
    resolution: template.resolution,
  };
}

/**
 * Evaluates all eight §11.6 conditions and returns every one that fires.
 *
 * Deliberately returns all of them rather than short-circuiting on the first:
 * a client fixing one blocker only to hit the next is a bad five-day experience.
 */
export function detectHardStops(context: HardStopContext): HardStop[] {
  const stops: HardStop[] = [];

  if (isBlank(context.accountableOwnerRole)) {
    stops.push(stop('no_accountable_owner'));
  }

  if (isBlank(context.dailyUserRole)) {
    stops.push(stop('no_daily_user'));
  }

  if (isBlank(context.measurableOutcome.kpi) && !context.measurableOutcome.proxyAccepted) {
    stops.push(stop('no_measurable_outcome'));
  }

  const blockedSystems = context.requiredSystems.filter(
    (system) => system.status === 'prohibited' || system.status === 'unavailable',
  );
  if (blockedSystems.length > 0) {
    stops.push(
      stop(
        'required_data_prohibited',
        `Affected systems: ${blockedSystems.map((s) => s.systemName).join(', ')}.`,
      ),
    );
  }

  const brandReviewMissing =
    context.review.brandReviewRequired && !context.review.brandReviewerAvailable;
  const legalReviewMissing =
    context.review.legalReviewRequired && !context.review.legalReviewerAvailable;
  if (brandReviewMissing || legalReviewMissing) {
    const missing = [
      brandReviewMissing ? 'brand' : null,
      legalReviewMissing ? 'legal' : null,
    ].filter((value): value is string => value !== null);
    stops.push(
      stop('review_required_but_unavailable', `Missing reviewer for: ${missing.join(', ')}.`),
    );
  }

  if (!context.policy.modelAndDataFlowPermitted) {
    stops.push(
      stop('policy_prohibits_model_or_data_flow', context.policy.restrictionNote ?? undefined),
    );
  }

  if (context.output.highImpact && !context.output.humanCheckBeforeRelease) {
    stops.push(stop('output_uncheckable_before_release'));
  }

  const unavailableDependencies = context.dependencies.filter((d) => !d.clientCanProvide);
  if (unavailableDependencies.length > 0) {
    stops.push(
      stop(
        'integration_or_right_unavailable',
        `Unavailable: ${unavailableDependencies.map((d) => d.name).join(', ')}.`,
      ),
    );
  }

  return stops;
}
