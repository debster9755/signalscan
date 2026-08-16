/**
 * Assessment lifecycle — PRD §5.1.
 *
 *   draft → collecting_inputs → mapping_workflow → analyzing
 *         → strategist_review → client_review → final → archived
 *
 * Plus three exceptions, each of which exists for a real operational reason:
 *   - any non-final state can move to `blocked` with a reason;
 *   - `blocked` returns to the state it came from, not to an arbitrary state;
 *   - `final` is immutable — a change forks a new report version and reopens
 *     the assessment at `strategist_review`;
 *   - `archived` is terminal and read-only.
 */

export type AssessmentStatus =
  | 'draft'
  | 'collecting_inputs'
  | 'mapping_workflow'
  | 'analyzing'
  | 'strategist_review'
  | 'client_review'
  | 'final'
  | 'archived'
  | 'blocked';

/** The happy path, in order. Index position defines "the next state". */
export const LINEAR_FLOW: readonly AssessmentStatus[] = Object.freeze([
  'draft',
  'collecting_inputs',
  'mapping_workflow',
  'analyzing',
  'strategist_review',
  'client_review',
  'final',
]);

/** The five-day operating workflow in §5 maps each day to one of these. */
export const DAY_FOR_STATUS: Readonly<Partial<Record<AssessmentStatus, number>>> = Object.freeze({
  draft: 0,
  collecting_inputs: 1,
  mapping_workflow: 2,
  analyzing: 3,
  strategist_review: 4,
  client_review: 5,
  final: 5,
});

export interface AssessmentState {
  status: AssessmentStatus;
  /** Set only while `status` is `blocked` — the state to return to. */
  blockedFrom: AssessmentStatus | null;
  blockedReason: string | null;
}

export interface TransitionResult {
  state: AssessmentState;
  /**
   * True when this transition reopened a finalised assessment. The caller must
   * create a new immutable report version (§13.3) — the state machine records
   * the requirement; it does not perform it.
   */
  requiresNewReportVersion: boolean;
}

export class InvalidTransitionError extends Error {
  readonly from: AssessmentStatus;
  readonly to: AssessmentStatus;

  constructor(from: AssessmentStatus, to: AssessmentStatus, detail: string) {
    super(`Cannot move assessment from "${from}" to "${to}": ${detail}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function initialState(): AssessmentState {
  return { status: 'draft', blockedFrom: null, blockedReason: null };
}

export function isTerminal(status: AssessmentStatus): boolean {
  return status === 'archived';
}

/** §5.1: `final` is immutable and `archived` is read-only. */
export function isEditable(status: AssessmentStatus): boolean {
  return status !== 'final' && status !== 'archived';
}

export function nextLinearStatus(status: AssessmentStatus): AssessmentStatus | null {
  const index = LINEAR_FLOW.indexOf(status);
  if (index === -1 || index === LINEAR_FLOW.length - 1) return null;
  return LINEAR_FLOW[index + 1] ?? null;
}

function assertBlockReason(reason: string | null | undefined): string {
  if (reason === null || reason === undefined || reason.trim().length === 0) {
    throw new InvalidTransitionError(
      'blocked',
      'blocked',
      'a blocking reason is required (§5.1) so the client knows what to resolve',
    );
  }
  return reason.trim();
}

export interface TransitionOptions {
  /** Required when moving to `blocked`. */
  reason?: string | null;
}

/**
 * The single legal way to change an assessment's status.
 *
 * Everything is rejected unless §5.1 explicitly permits it — including
 * skipping a stage, which would let an assessment reach `final` without an
 * operator-validated workflow map.
 */
export function transition(
  state: AssessmentState,
  to: AssessmentStatus,
  options: TransitionOptions = {},
): TransitionResult {
  const from = state.status;

  if (from === 'archived') {
    throw new InvalidTransitionError(from, to, 'archived assessments are read-only');
  }

  // Also covers blocked → blocked: an already-blocked assessment is updated by
  // editing its reason, not by re-blocking it.
  if (to === from) {
    throw new InvalidTransitionError(from, to, 'the assessment is already in that state');
  }

  // ── Blocking ───────────────────────────────────────────────────────────────
  if (to === 'blocked') {
    if (from === 'final') {
      throw new InvalidTransitionError(from, to, 'a finalised assessment cannot be blocked');
    }
    return {
      state: {
        status: 'blocked',
        blockedFrom: from,
        blockedReason: assertBlockReason(options.reason),
      },
      requiresNewReportVersion: false,
    };
  }

  // ── Unblocking ─────────────────────────────────────────────────────────────
  if (from === 'blocked') {
    // §5.1: "blocked can return to the immediately previous state." Not to any
    // state the caller fancies — that would let a block launder a stage skip.
    if (to !== state.blockedFrom) {
      throw new InvalidTransitionError(
        from,
        to,
        `a blocked assessment can only return to "${state.blockedFrom}"`,
      );
    }
    return {
      state: { status: to, blockedFrom: null, blockedReason: null },
      requiresNewReportVersion: false,
    };
  }

  // ── Reopening a finalised assessment ───────────────────────────────────────
  if (from === 'final') {
    if (to === 'archived') {
      return {
        state: { status: 'archived', blockedFrom: null, blockedReason: null },
        requiresNewReportVersion: false,
      };
    }
    if (to === 'strategist_review') {
      // §5.1: changes to a final assessment create a NEW report version and
      // reopen at strategist review. The old version stays immutable.
      return {
        state: { status: 'strategist_review', blockedFrom: null, blockedReason: null },
        requiresNewReportVersion: true,
      };
    }
    throw new InvalidTransitionError(
      from,
      to,
      'a finalised assessment can only be archived or reopened at strategist_review',
    );
  }

  // ── Archiving ──────────────────────────────────────────────────────────────
  if (to === 'archived') {
    throw new InvalidTransitionError(
      from,
      to,
      'only a finalised assessment can be archived (§5.1)',
    );
  }

  // ── Normal forward movement ────────────────────────────────────────────────
  const expected = nextLinearStatus(from);
  if (to !== expected) {
    throw new InvalidTransitionError(
      from,
      to,
      `the next state is "${expected}" — stages cannot be skipped`,
    );
  }

  return {
    state: { status: to, blockedFrom: null, blockedReason: null },
    requiresNewReportVersion: false,
  };
}

/** Every status this state could legally move to right now. Drives UI affordances. */
export function allowedTransitions(state: AssessmentState): AssessmentStatus[] {
  const allowed: AssessmentStatus[] = [];
  const candidates: AssessmentStatus[] = [
    'draft',
    'collecting_inputs',
    'mapping_workflow',
    'analyzing',
    'strategist_review',
    'client_review',
    'final',
    'archived',
    'blocked',
  ];
  for (const candidate of candidates) {
    try {
      transition(state, candidate, { reason: 'probe' });
      allowed.push(candidate);
    } catch {
      // Not permitted from here — omit it.
    }
  }
  return allowed;
}
