import { describe, expect, it } from 'vitest';
import {
  type AssessmentState,
  type AssessmentStatus,
  DAY_FOR_STATUS,
  InvalidTransitionError,
  LINEAR_FLOW,
  allowedTransitions,
  initialState,
  isEditable,
  isTerminal,
  nextLinearStatus,
  transition,
} from './state-machine';

const at = (status: AssessmentStatus): AssessmentState => ({
  status,
  blockedFrom: null,
  blockedReason: null,
});

const blockedFrom = (from: AssessmentStatus): AssessmentState => ({
  status: 'blocked',
  blockedFrom: from,
  blockedReason: 'Client has not supplied brand guidelines.',
});

describe('assessment lifecycle (§5.1)', () => {
  it('starts at draft', () => {
    expect(initialState()).toEqual({ status: 'draft', blockedFrom: null, blockedReason: null });
  });

  it('walks the full five-day flow one stage at a time', () => {
    let state = initialState();
    const visited: AssessmentStatus[] = [state.status];
    for (const target of LINEAR_FLOW.slice(1)) {
      state = transition(state, target).state;
      visited.push(state.status);
    }
    expect(visited).toEqual([
      'draft',
      'collecting_inputs',
      'mapping_workflow',
      'analyzing',
      'strategist_review',
      'client_review',
      'final',
    ]);
  });

  it('maps each status to its day in the §5 operating workflow', () => {
    expect(DAY_FOR_STATUS.collecting_inputs).toBe(1);
    expect(DAY_FOR_STATUS.mapping_workflow).toBe(2);
    expect(DAY_FOR_STATUS.analyzing).toBe(3);
    expect(DAY_FOR_STATUS.strategist_review).toBe(4);
    expect(DAY_FOR_STATUS.client_review).toBe(5);
  });

  it('refuses to skip a stage', () => {
    // Skipping mapping_workflow would let an assessment reach `final` with no
    // operator-validated flow map — the one thing §8.4 insists on.
    expect(() => transition(at('collecting_inputs'), 'analyzing')).toThrow(InvalidTransitionError);
    expect(() => transition(at('draft'), 'final')).toThrow(/stages cannot be skipped/);
  });

  it('refuses to move backwards through the linear flow', () => {
    expect(() => transition(at('analyzing'), 'collecting_inputs')).toThrow(InvalidTransitionError);
  });

  it('refuses a no-op transition', () => {
    expect(() => transition(at('analyzing'), 'analyzing')).toThrow(/already in that state/);
  });

  it('reports the next state in the flow', () => {
    expect(nextLinearStatus('draft')).toBe('collecting_inputs');
    expect(nextLinearStatus('final')).toBeNull();
    expect(nextLinearStatus('blocked')).toBeNull();
    expect(nextLinearStatus('archived')).toBeNull();
  });
});

describe('blocking (§5.1)', () => {
  it('can block from any non-final state and remembers where it came from', () => {
    const result = transition(at('mapping_workflow'), 'blocked', {
      reason: 'Operator unavailable until Monday.',
    });
    expect(result.state.status).toBe('blocked');
    expect(result.state.blockedFrom).toBe('mapping_workflow');
    expect(result.state.blockedReason).toBe('Operator unavailable until Monday.');
  });

  it('requires a reason so the client knows what to resolve', () => {
    expect(() => transition(at('analyzing'), 'blocked')).toThrow(/blocking reason is required/);
    expect(() => transition(at('analyzing'), 'blocked', { reason: '   ' })).toThrow(
      /blocking reason is required/,
    );
    expect(() => transition(at('analyzing'), 'blocked', { reason: null })).toThrow(
      /blocking reason is required/,
    );
  });

  it('trims the stored reason', () => {
    const result = transition(at('analyzing'), 'blocked', { reason: '  Waiting on legal.  ' });
    expect(result.state.blockedReason).toBe('Waiting on legal.');
  });

  it('cannot block a finalised assessment', () => {
    expect(() => transition(at('final'), 'blocked', { reason: 'x' })).toThrow(
      /finalised assessment cannot be blocked/,
    );
  });

  it('cannot re-block an already-blocked assessment', () => {
    // Changing why something is blocked is an edit to the reason, not a
    // transition — otherwise the blockedFrom pointer would be overwritten with
    // 'blocked' and the return path would be lost.
    expect(() => transition(blockedFrom('analyzing'), 'blocked', { reason: 'x' })).toThrow(
      /already in that state/,
    );
  });

  it('returns only to the state it came from', () => {
    const result = transition(blockedFrom('mapping_workflow'), 'mapping_workflow');
    expect(result.state.status).toBe('mapping_workflow');
    expect(result.state.blockedFrom).toBeNull();
    expect(result.state.blockedReason).toBeNull();
  });

  it('refuses to let a block launder a stage skip', () => {
    // Block at collecting_inputs, unblock straight into analyzing — this is the
    // hole the "immediately previous state" wording in §5.1 exists to close.
    expect(() => transition(blockedFrom('collecting_inputs'), 'analyzing')).toThrow(
      /can only return to "collecting_inputs"/,
    );
  });
});

describe('finalisation and immutability (§5.1, §13.3)', () => {
  it('treats final as immutable — reopening forks a new report version', () => {
    const result = transition(at('final'), 'strategist_review');
    expect(result.state.status).toBe('strategist_review');
    expect(result.requiresNewReportVersion).toBe(true);
  });

  it('does not demand a new report version for ordinary forward movement', () => {
    expect(transition(at('draft'), 'collecting_inputs').requiresNewReportVersion).toBe(false);
  });

  it('archives from final', () => {
    const result = transition(at('final'), 'archived');
    expect(result.state.status).toBe('archived');
    expect(result.requiresNewReportVersion).toBe(false);
  });

  it('refuses any other move out of final', () => {
    expect(() => transition(at('final'), 'client_review')).toThrow(
      /can only be archived or reopened at strategist_review/,
    );
  });

  it('only archives a finalised assessment', () => {
    expect(() => transition(at('analyzing'), 'archived')).toThrow(
      /only a finalised assessment can be archived/,
    );
  });

  it('treats archived as read-only and terminal', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('final')).toBe(false);
    for (const target of LINEAR_FLOW) {
      expect(() => transition(at('archived'), target)).toThrow(/read-only/);
    }
  });

  it('reports which states still accept edits', () => {
    expect(isEditable('analyzing')).toBe(true);
    expect(isEditable('final')).toBe(false);
    expect(isEditable('archived')).toBe(false);
  });
});

describe('allowedTransitions', () => {
  it('offers forward movement and blocking from a working state', () => {
    expect(allowedTransitions(at('analyzing')).sort()).toEqual(['blocked', 'strategist_review']);
  });

  it('offers only the return path from a blocked state', () => {
    expect(allowedTransitions(blockedFrom('analyzing'))).toEqual(['analyzing']);
  });

  it('offers archive and reopen from final', () => {
    expect(allowedTransitions(at('final')).sort()).toEqual(['archived', 'strategist_review']);
  });

  it('offers nothing from archived', () => {
    expect(allowedTransitions(at('archived'))).toEqual([]);
  });

  it('exposes the error metadata a caller needs to explain the refusal', () => {
    try {
      transition(at('draft'), 'final');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      expect((error as InvalidTransitionError).from).toBe('draft');
      expect((error as InvalidTransitionError).to).toBe('final');
    }
  });
});
