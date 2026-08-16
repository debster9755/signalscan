/**
 * Workspace RBAC — PRD §4.1, §4.2, §4.3.
 *
 * The §4.2 matrix is not a grid of booleans. Several cells are qualified —
 * "Sponsor-approved users only", "Assigned questions", "Yes, with reason",
 * "If enabled", "Request only" — and flattening those to `true` is how a
 * client sponsor ends up able to invite anyone, or a strategist overrides a
 * score with no audit trail. So the matrix keeps the qualification as data and
 * `can()` resolves it against the request context.
 */

export type Role =
  | 'system_admin'
  | 'rb_admin'
  | 'strategist'
  | 'client_sponsor'
  | 'client_contributor'
  | 'client_reviewer'
  | 'read_only';

export const ROLES: readonly Role[] = Object.freeze([
  'system_admin',
  'rb_admin',
  'strategist',
  'client_sponsor',
  'client_contributor',
  'client_reviewer',
  'read_only',
]);

/** Roles belonging to the client organisation. Subject to the §4.3 visibility rule. */
export const CLIENT_ROLES: readonly Role[] = Object.freeze([
  'client_sponsor',
  'client_contributor',
  'client_reviewer',
]);

export type Capability =
  | 'create_assessment'
  | 'invite_users'
  | 'answer_intake'
  | 'upload_evidence'
  | 'view_internal_notes'
  | 'edit_workflow'
  | 'review_workflow'
  | 'approve_brand_rules'
  | 'generate_analysis'
  | 'override_score'
  | 'finalize_report'
  | 'approve_recommendation'
  | 'export_raw_evidence'
  | 'delete_assessment'
  | 'request_assessment_deletion';

export const CAPABILITIES: readonly Capability[] = Object.freeze([
  'create_assessment',
  'invite_users',
  'answer_intake',
  'upload_evidence',
  'view_internal_notes',
  'edit_workflow',
  'review_workflow',
  'approve_brand_rules',
  'generate_analysis',
  'override_score',
  'finalize_report',
  'approve_recommendation',
  'export_raw_evidence',
  'delete_assessment',
  'request_assessment_deletion',
]);

/** The qualifications that appear in the §4.2 matrix. */
export type PermissionCondition =
  | 'sponsor_approved_users_only'
  | 'assigned_questions_only'
  | 'assigned_stages_only'
  | 'requires_written_reason'
  | 'requires_client_raw_export_enabled'
  | 'requires_support_mode';

type Grant =
  | { effect: 'allow' }
  | { effect: 'allow_if'; condition: PermissionCondition }
  | { effect: 'deny'; reason: string };

const ALLOW: Grant = { effect: 'allow' };
const deny = (reason: string): Grant => ({ effect: 'deny', reason });
const allowIf = (condition: PermissionCondition): Grant => ({ effect: 'allow_if', condition });

const DENY_NOT_PERMITTED = deny('This role does not have that capability in this workspace.');
const DENY_READ_ONLY = deny('Read-only members can view shared final content but cannot act on it.');
const DENY_REVIEW_ONLY = deny('This role may review but not edit. Use the review action instead.');
const DENY_REQUEST_ONLY = deny(
  'This role may request deletion but not perform it. An RB admin must confirm.',
);

/**
 * §4.2, transcribed. `system_admin` is not in the published matrix because it is
 * platform operations, not a workspace role — it gets full access but only
 * while support mode is explicitly active, so routine use is impossible.
 */
const MATRIX: Readonly<Record<Role, Readonly<Record<Capability, Grant>>>> = Object.freeze({
  system_admin: Object.freeze(
    Object.fromEntries(
      CAPABILITIES.map((c) => [c, allowIf('requires_support_mode')]),
    ) as Record<Capability, Grant>,
  ),

  rb_admin: Object.freeze({
    create_assessment: ALLOW,
    invite_users: ALLOW,
    answer_intake: ALLOW,
    upload_evidence: ALLOW,
    view_internal_notes: ALLOW,
    edit_workflow: ALLOW,
    review_workflow: ALLOW,
    approve_brand_rules: ALLOW,
    generate_analysis: ALLOW,
    override_score: ALLOW,
    finalize_report: ALLOW,
    // §4.2: the client sponsor approves the recommendation, not Red Baron.
    // Red Baron approving its own recommendation would void the whole exercise.
    approve_recommendation: deny('Only the client sponsor can approve the recommendation.'),
    export_raw_evidence: ALLOW,
    delete_assessment: ALLOW,
    request_assessment_deletion: ALLOW,
  }),

  strategist: Object.freeze({
    create_assessment: ALLOW,
    invite_users: ALLOW,
    answer_intake: ALLOW,
    upload_evidence: ALLOW,
    view_internal_notes: ALLOW,
    edit_workflow: ALLOW,
    review_workflow: ALLOW,
    approve_brand_rules: ALLOW,
    generate_analysis: ALLOW,
    override_score: allowIf('requires_written_reason'),
    finalize_report: ALLOW,
    approve_recommendation: deny('Only the client sponsor can approve the recommendation.'),
    export_raw_evidence: ALLOW,
    delete_assessment: DENY_REQUEST_ONLY,
    request_assessment_deletion: ALLOW,
  }),

  client_sponsor: Object.freeze({
    create_assessment: DENY_NOT_PERMITTED,
    invite_users: allowIf('sponsor_approved_users_only'),
    answer_intake: ALLOW,
    upload_evidence: ALLOW,
    view_internal_notes: deny('Internal Red Baron notes are never visible to the client (§4.3).'),
    edit_workflow: DENY_REVIEW_ONLY,
    review_workflow: ALLOW,
    approve_brand_rules: ALLOW,
    generate_analysis: DENY_NOT_PERMITTED,
    override_score: DENY_NOT_PERMITTED,
    finalize_report: DENY_NOT_PERMITTED,
    approve_recommendation: ALLOW,
    export_raw_evidence: allowIf('requires_client_raw_export_enabled'),
    delete_assessment: DENY_REQUEST_ONLY,
    request_assessment_deletion: ALLOW,
  }),

  client_contributor: Object.freeze({
    create_assessment: DENY_NOT_PERMITTED,
    invite_users: DENY_NOT_PERMITTED,
    answer_intake: ALLOW,
    upload_evidence: ALLOW,
    view_internal_notes: deny('Internal Red Baron notes are never visible to the client (§4.3).'),
    edit_workflow: allowIf('assigned_stages_only'),
    review_workflow: ALLOW,
    approve_brand_rules: DENY_NOT_PERMITTED,
    generate_analysis: DENY_NOT_PERMITTED,
    override_score: DENY_NOT_PERMITTED,
    finalize_report: DENY_NOT_PERMITTED,
    approve_recommendation: DENY_NOT_PERMITTED,
    export_raw_evidence: DENY_NOT_PERMITTED,
    delete_assessment: DENY_NOT_PERMITTED,
    request_assessment_deletion: DENY_NOT_PERMITTED,
  }),

  client_reviewer: Object.freeze({
    create_assessment: DENY_NOT_PERMITTED,
    invite_users: DENY_NOT_PERMITTED,
    answer_intake: allowIf('assigned_questions_only'),
    upload_evidence: ALLOW,
    view_internal_notes: deny('Internal Red Baron notes are never visible to the client (§4.3).'),
    edit_workflow: DENY_REVIEW_ONLY,
    review_workflow: ALLOW,
    approve_brand_rules: ALLOW,
    generate_analysis: DENY_NOT_PERMITTED,
    override_score: DENY_NOT_PERMITTED,
    finalize_report: DENY_NOT_PERMITTED,
    // §4.2 lists this as "Optional co-review" — the reviewer may record a
    // co-review, but the sponsor's decision is the one that counts.
    approve_recommendation: ALLOW,
    export_raw_evidence: DENY_NOT_PERMITTED,
    delete_assessment: DENY_NOT_PERMITTED,
    request_assessment_deletion: DENY_NOT_PERMITTED,
  }),

  read_only: Object.freeze(
    Object.fromEntries(CAPABILITIES.map((c) => [c, DENY_READ_ONLY])) as Record<Capability, Grant>,
  ),
});

export interface PermissionContext {
  /** Every check fails closed for a non-member, whatever their role says. */
  isWorkspaceMember: boolean;
  /** For `invite_users` by a client sponsor. */
  targetUserApprovedBySponsor?: boolean;
  /** For `answer_intake` by a client reviewer. */
  questionAssignedToUser?: boolean;
  /** For `edit_workflow` by a client contributor. */
  stageAssignedToUser?: boolean;
  /** For `override_score` — §11.1 requires a written reason. */
  writtenReasonProvided?: boolean;
  /** For `export_raw_evidence` by a sponsor — FEATURE_CLIENT_RAW_EXPORT. */
  clientRawExportEnabled?: boolean;
  /** For `system_admin` — controlled support access only. */
  supportModeActive?: boolean;
}

export interface PermissionDecision {
  allowed: boolean;
  /** Always populated. Safe to surface to the user and to write to the audit log. */
  reason: string;
  /** The qualification that applied, when one did. */
  condition?: PermissionCondition;
}

const CONDITION_RESOLVERS: Record<
  PermissionCondition,
  (context: PermissionContext) => PermissionDecision
> = {
  sponsor_approved_users_only: (context) =>
    context.targetUserApprovedBySponsor === true
      ? { allowed: true, reason: 'Sponsor has approved this user.' }
      : {
          allowed: false,
          reason: 'A client sponsor may only invite users they have explicitly approved.',
        },

  assigned_questions_only: (context) =>
    context.questionAssignedToUser === true
      ? { allowed: true, reason: 'Question is assigned to this reviewer.' }
      : { allowed: false, reason: 'A reviewer may only answer questions assigned to them.' },

  assigned_stages_only: (context) =>
    context.stageAssignedToUser === true
      ? { allowed: true, reason: 'Stage is assigned to this contributor.' }
      : { allowed: false, reason: 'A contributor may only edit workflow stages assigned to them.' },

  requires_written_reason: (context) =>
    context.writtenReasonProvided === true
      ? { allowed: true, reason: 'Written override reason supplied.' }
      : {
          allowed: false,
          reason: 'A score override requires a written reason and is recorded in the audit log (§11.1).',
        },

  requires_client_raw_export_enabled: (context) =>
    context.clientRawExportEnabled === true
      ? { allowed: true, reason: 'Raw evidence export is enabled for this workspace.' }
      : {
          allowed: false,
          reason: 'Raw evidence export is not enabled for this client workspace.',
        },

  requires_support_mode: (context) =>
    context.supportModeActive === true
      ? { allowed: true, reason: 'Platform support mode is active; this action is audited.' }
      : {
          allowed: false,
          reason: 'Platform administration requires an active, audited support session.',
        },
};

/**
 * The single authorisation decision point. Every API route calls this before
 * touching data — §22.1 requires server-side authorisation on every read and
 * mutation, and a second implementation is a second chance to get it wrong.
 */
export function can(
  role: Role,
  capability: Capability,
  context: PermissionContext,
): PermissionDecision {
  if (!context.isWorkspaceMember) {
    // §25: unauthorised access returns a generic response and never confirms
    // whether the record exists.
    return { allowed: false, reason: 'Not a member of this workspace.' };
  }

  const grant = MATRIX[role][capability];

  if (grant.effect === 'allow') {
    return { allowed: true, reason: 'Permitted for this role.' };
  }

  if (grant.effect === 'deny') {
    return { allowed: false, reason: grant.reason };
  }

  const resolved = CONDITION_RESOLVERS[grant.condition](context);
  return { ...resolved, condition: grant.condition };
}

/** Convenience for call sites that only need the boolean. */
export function isAllowed(
  role: Role,
  capability: Capability,
  context: PermissionContext,
): boolean {
  return can(role, capability, context).allowed;
}

/**
 * §4.3 visibility rule. Internal notes, draft rankings before the strategist
 * shares them, and commercial notes are never visible to a client role —
 * regardless of any capability grant.
 */
export function isClientRole(role: Role): boolean {
  return CLIENT_ROLES.includes(role);
}

export function canSeeInternalContent(role: Role): boolean {
  return role === 'rb_admin' || role === 'strategist';
}

/**
 * Draft opportunity rankings stay invisible to the client until the strategist
 * shares them (§4.3, §18.4 "client after sharing").
 */
export function canSeeOpportunityRankings(role: Role, sharedWithClient: boolean): boolean {
  if (canSeeInternalContent(role)) return true;
  if (role === 'read_only') return false;
  return isClientRole(role) && sharedWithClient;
}
