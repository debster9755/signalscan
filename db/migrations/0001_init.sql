-- SignalScan 0001 — extensions, enums, tenancy and the assessment lifecycle.
-- PRD §17.1. Every client-owned table carries workspace_id, created_at,
-- updated_at, created_by and is covered by row-level security (§17, §22.1).

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "vector";    -- asset_chunks.embedding

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE organization_type   AS ENUM ('red_baron', 'client');
CREATE TYPE organization_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE workspace_status    AS ENUM ('active', 'archived', 'deleting');

-- §4.1
CREATE TYPE workspace_role AS ENUM (
  'system_admin', 'rb_admin', 'strategist',
  'client_sponsor', 'client_contributor', 'client_reviewer', 'read_only'
);
CREATE TYPE membership_status AS ENUM ('invited', 'active', 'disabled');

-- §5.1
CREATE TYPE assessment_status AS ENUM (
  'draft', 'collecting_inputs', 'mapping_workflow', 'analyzing',
  'strategist_review', 'client_review', 'final', 'archived', 'blocked'
);

CREATE TYPE response_status AS ENUM ('draft', 'submitted', 'confirmed');

-- §6.4 / §6.5
CREATE TYPE input_asset_category AS ENUM (
  'brand_guideline', 'campaign_brief', 'campaign_asset', 'campaign_performance',
  'process_document', 'tool_export', 'policy_document', 'competitor_evidence',
  'interview_note', 'other'
);
CREATE TYPE asset_status AS ENUM (
  'uploading', 'uploaded', 'scanning', 'quarantined', 'parsing',
  'parsed', 'needs_review', 'failed', 'deleted'
);

CREATE TYPE brand_label AS ENUM ('on_brand', 'off_brand', 'neutral', 'unknown');
CREATE TYPE competitor_status AS ENUM ('proposed', 'confirmed', 'rejected');

-- §8.3
CREATE TYPE stage_capture_method AS ENUM ('template', 'evidence', 'interview', 'manual');
CREATE TYPE stage_status AS ENUM ('draft', 'operator_validated', 'strategist_validated');
CREATE TYPE flow_variant AS ENUM ('documented', 'observed');

-- §9.4
CREATE TYPE brand_rule_category AS ENUM (
  'purpose', 'audience', 'positioning', 'promise', 'message_pillar', 'proof_point',
  'tone', 'vocabulary', 'prohibited_language', 'content_do', 'content_dont',
  'visual', 'claim', 'legal', 'approval'
);
CREATE TYPE brand_rule_origin AS ENUM ('official_guideline', 'campaign_inference', 'human_added');
CREATE TYPE brand_rule_status AS ENUM ('pending', 'approved', 'edited', 'rejected');

CREATE TYPE citation_author_type AS ENUM ('system', 'model', 'human');

-- §10.4
CREATE TYPE strategist_status AS ENUM ('draft', 'shortlisted', 'recommended', 'rejected');
CREATE TYPE priority_band AS ENUM ('recommend', 'conditional', 'backlog', 'blocked');

-- §13.3 / §17.1
CREATE TYPE report_status AS ENUM ('draft', 'final', 'superseded');
CREATE TYPE approval_subject AS ENUM ('workflow', 'brand_rule', 'report', 'recommendation');
CREATE TYPE approval_decision AS ENUM ('approved', 'rejected', 'changes_requested');

-- §19
CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE actor_type AS ENUM ('user', 'system', 'job');

-- ─── Identity and tenancy ─────────────────────────────────────────────────────

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  display_name  text NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness without depending on the citext extension, which
-- is not available on every managed Postgres.
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE organizations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  slug                   text UNIQUE NOT NULL,
  type                   organization_type NOT NULL,
  status                 organization_status NOT NULL DEFAULT 'active',
  default_retention_days int NOT NULL DEFAULT 90
    CONSTRAINT organizations_retention_range CHECK (default_retention_days BETWEEN 30 AND 365),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name                   text NOT NULL,
  status                 workspace_status NOT NULL DEFAULT 'active',
  retention_days         int NOT NULL DEFAULT 90
    CONSTRAINT workspaces_retention_range CHECK (retention_days BETWEEN 30 AND 365),
  created_by             uuid REFERENCES users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspaces_org_idx ON workspaces (client_organization_id);

CREATE TABLE workspace_users (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         workspace_role NOT NULL,
  status       membership_status NOT NULL DEFAULT 'invited',
  invited_by   uuid REFERENCES users(id),
  invited_at   timestamptz,
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_users_user_idx ON workspace_users (user_id);

-- ─── Assessments ──────────────────────────────────────────────────────────────

CREATE TABLE assessments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title            text NOT NULL,
  status           assessment_status NOT NULL DEFAULT 'draft',
  -- §5.1: a blocked assessment returns to the state it came from, so the
  -- pointer has to be stored, not inferred.
  blocked_from     assessment_status,
  blocked_reason   text,
  current_version  int NOT NULL DEFAULT 1,
  owner_user_id    uuid NOT NULL REFERENCES users(id),
  sponsor_user_id  uuid REFERENCES users(id),
  operator_user_id uuid REFERENCES users(id),
  focus_product    text,
  focus_market     text,
  focus_audience   text,
  currency         char(3) NOT NULL DEFAULT 'INR'
    CONSTRAINT assessments_currency_iso4217 CHECK (currency ~ '^[A-Z]{3}$'),
  due_at           timestamptz,
  finalized_at     timestamptz,
  archived_at      timestamptz,
  created_by       uuid NOT NULL REFERENCES users(id),
  updated_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessments_blocked_has_reason
    CHECK (status <> 'blocked' OR (blocked_from IS NOT NULL AND blocked_reason IS NOT NULL))
);
CREATE INDEX assessments_workspace_idx ON assessments (workspace_id);
CREATE INDEX assessments_workspace_status_idx ON assessments (workspace_id, status);

-- ─── Guided intake (§7) ───────────────────────────────────────────────────────

-- Versioned definitions: a later edit must never retroactively change what an
-- already-answered assessment was asked (§7.3).
CREATE TABLE question_definitions (
  id              text NOT NULL,
  version         int  NOT NULL,
  group_key       text NOT NULL,
  order_number    int  NOT NULL,
  definition_json jsonb NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);
CREATE INDEX question_definitions_active_idx ON question_definitions (active, order_number);

CREATE TABLE question_responses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id    uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id      text NOT NULL,
  question_version int  NOT NULL,
  response_json    jsonb NOT NULL,
  status           response_status NOT NULL DEFAULT 'draft',
  response_version int NOT NULL DEFAULT 1,
  answered_by      uuid REFERENCES users(id),
  answered_at      timestamptz,
  confirmed_by     uuid REFERENCES users(id),
  confirmed_at     timestamptz,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (question_id, question_version) REFERENCES question_definitions (id, version),
  UNIQUE (assessment_id, question_id, response_version)
);
CREATE INDEX question_responses_scope_idx ON question_responses (workspace_id, assessment_id);

COMMIT;
