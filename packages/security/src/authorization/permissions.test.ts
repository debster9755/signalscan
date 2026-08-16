import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  CLIENT_ROLES,
  ROLES,
  type Capability,
  type PermissionContext,
  type Role,
  can,
  canSeeInternalContent,
  canSeeOpportunityRankings,
  isAllowed,
  isClientRole,
} from './permissions.js';

const member: PermissionContext = { isWorkspaceMember: true };

const allow = (role: Role, capability: Capability, context: Partial<PermissionContext> = {}) =>
  isAllowed(role, capability, { ...member, ...context });

describe('§4.2 permission matrix', () => {
  it('covers every role × capability pair with an explicit decision', () => {
    // A missing cell would fall through to `undefined` and throw at runtime on
    // whichever route happened to hit it first.
    for (const role of ROLES) {
      for (const capability of CAPABILITIES) {
        const decision = can(role, capability, member);
        expect(typeof decision.allowed, `${role}/${capability}`).toBe('boolean');
        expect(decision.reason.length, `${role}/${capability}`).toBeGreaterThan(0);
      }
    }
  });

  it.each([
    ['rb_admin', 'create_assessment', true],
    ['strategist', 'create_assessment', true],
    ['client_sponsor', 'create_assessment', false],
    ['client_contributor', 'create_assessment', false],
    ['client_reviewer', 'create_assessment', false],
    ['read_only', 'create_assessment', false],

    ['rb_admin', 'generate_analysis', true],
    ['strategist', 'generate_analysis', true],
    ['client_sponsor', 'generate_analysis', false],

    ['rb_admin', 'finalize_report', true],
    ['strategist', 'finalize_report', true],
    ['client_sponsor', 'finalize_report', false],

    ['client_sponsor', 'approve_recommendation', true],
    ['client_reviewer', 'approve_recommendation', true],
    ['rb_admin', 'approve_recommendation', false],
    ['strategist', 'approve_recommendation', false],

    ['rb_admin', 'upload_evidence', true],
    ['client_contributor', 'upload_evidence', true],
    ['client_reviewer', 'upload_evidence', true],
    ['read_only', 'upload_evidence', false],

    ['rb_admin', 'delete_assessment', true],
    ['strategist', 'delete_assessment', false],
    ['client_sponsor', 'delete_assessment', false],
  ] as const)('%s / %s → %s', (role, capability, expected) => {
    expect(allow(role, capability)).toBe(expected);
  });

  it('never lets Red Baron approve its own recommendation', () => {
    // The whole product promise is a client-approved recommendation. If the
    // strategist could approve it, the approval would be worthless.
    expect(allow('strategist', 'approve_recommendation')).toBe(false);
    expect(allow('rb_admin', 'approve_recommendation')).toBe(false);
  });

  it('denies every capability to read-only members', () => {
    for (const capability of CAPABILITIES) {
      expect(allow('read_only', capability), capability).toBe(false);
    }
  });

  it('fails closed for a non-member regardless of role', () => {
    for (const role of ROLES) {
      for (const capability of CAPABILITIES) {
        const decision = can(role, capability, {
          isWorkspaceMember: false,
          supportModeActive: true,
          writtenReasonProvided: true,
          clientRawExportEnabled: true,
        });
        expect(decision.allowed, `${role}/${capability}`).toBe(false);
      }
    }
  });
});

describe('qualified grants — the cells that are not simple yes/no', () => {
  it('requires a written reason before a strategist can override a score (§11.1)', () => {
    expect(allow('strategist', 'override_score')).toBe(false);
    expect(allow('strategist', 'override_score', { writtenReasonProvided: true })).toBe(true);

    const denied = can('strategist', 'override_score', member);
    expect(denied.condition).toBe('requires_written_reason');
    expect(denied.reason).toMatch(/written reason/);
  });

  it('lets an RB admin override without the reason gate, but audits either way', () => {
    expect(allow('rb_admin', 'override_score')).toBe(true);
  });

  it('limits a client sponsor to inviting sponsor-approved users', () => {
    expect(allow('client_sponsor', 'invite_users')).toBe(false);
    expect(allow('client_sponsor', 'invite_users', { targetUserApprovedBySponsor: true })).toBe(
      true,
    );
  });

  it('limits a client reviewer to their assigned intake questions', () => {
    expect(allow('client_reviewer', 'answer_intake')).toBe(false);
    expect(allow('client_reviewer', 'answer_intake', { questionAssignedToUser: true })).toBe(true);
    // Contributors and sponsors answer freely.
    expect(allow('client_contributor', 'answer_intake')).toBe(true);
    expect(allow('client_sponsor', 'answer_intake')).toBe(true);
  });

  it('limits a client contributor to their assigned workflow stages', () => {
    expect(allow('client_contributor', 'edit_workflow')).toBe(false);
    expect(allow('client_contributor', 'edit_workflow', { stageAssignedToUser: true })).toBe(true);
  });

  it('gives sponsors and reviewers review access but not edit access', () => {
    for (const role of ['client_sponsor', 'client_reviewer'] as const) {
      expect(allow(role, 'edit_workflow'), role).toBe(false);
      expect(allow(role, 'review_workflow'), role).toBe(true);
      expect(can(role, 'edit_workflow', member).reason).toMatch(/review but not edit/);
    }
  });

  it('gates sponsor raw-evidence export behind the workspace feature flag', () => {
    expect(allow('client_sponsor', 'export_raw_evidence')).toBe(false);
    expect(allow('client_sponsor', 'export_raw_evidence', { clientRawExportEnabled: true })).toBe(
      true,
    );
  });

  it('lets a strategist request deletion but never perform it', () => {
    expect(allow('strategist', 'delete_assessment')).toBe(false);
    expect(allow('strategist', 'request_assessment_deletion')).toBe(true);
    expect(can('strategist', 'delete_assessment', member).reason).toMatch(/RB admin must confirm/);
  });

  it('requires an active support session for platform administration', () => {
    // system_admin is deliberately inert without an audited support session, so
    // routine use of a superuser role is impossible rather than discouraged.
    expect(allow('system_admin', 'delete_assessment')).toBe(false);
    expect(allow('system_admin', 'delete_assessment', { supportModeActive: true })).toBe(true);
  });
});

describe('§4.3 client visibility rule', () => {
  it('hides internal Red Baron notes from every client role', () => {
    for (const role of CLIENT_ROLES) {
      expect(allow(role, 'view_internal_notes'), role).toBe(false);
      expect(can(role, 'view_internal_notes', member).reason).toMatch(
        /never visible to the client/,
      );
    }
    expect(allow('read_only', 'view_internal_notes')).toBe(false);
  });

  it('identifies which roles belong to the client organisation', () => {
    expect(isClientRole('client_sponsor')).toBe(true);
    expect(isClientRole('client_contributor')).toBe(true);
    expect(isClientRole('client_reviewer')).toBe(true);
    expect(isClientRole('strategist')).toBe(false);
    expect(isClientRole('rb_admin')).toBe(false);
  });

  it('limits internal content to Red Baron staff', () => {
    expect(canSeeInternalContent('rb_admin')).toBe(true);
    expect(canSeeInternalContent('strategist')).toBe(true);
    expect(canSeeInternalContent('client_sponsor')).toBe(false);
    expect(canSeeInternalContent('system_admin')).toBe(false);
  });

  describe('draft opportunity rankings', () => {
    it('hides them from the client until the strategist shares them', () => {
      expect(canSeeOpportunityRankings('client_sponsor', false)).toBe(false);
      expect(canSeeOpportunityRankings('client_sponsor', true)).toBe(true);
      expect(canSeeOpportunityRankings('client_contributor', true)).toBe(true);
    });

    it('always shows them to the strategist who is building them', () => {
      expect(canSeeOpportunityRankings('strategist', false)).toBe(true);
      expect(canSeeOpportunityRankings('rb_admin', false)).toBe(true);
    });

    it('never shows them to a read-only member, shared or not', () => {
      expect(canSeeOpportunityRankings('read_only', true)).toBe(false);
      expect(canSeeOpportunityRankings('read_only', false)).toBe(false);
    });

    it('never shows them to a platform admin acting outside the workspace', () => {
      expect(canSeeOpportunityRankings('system_admin', true)).toBe(false);
    });
  });
});
