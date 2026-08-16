-- SignalScan 0003 — reports, approvals, business case, jobs and audit.
-- PRD §12, §13, §17.1, §19, §24.

BEGIN;

-- ─── Business case (§12) ──────────────────────────────────────────────────────

CREATE TABLE business_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE CASCADE,
  currency      char(3) NOT NULL
    CONSTRAINT business_cases_currency_iso4217 CHECK (currency ~ '^[A-Z]{3}$'),
  -- One row per scenario name, values nullable because §12.1 forbids inventing
  -- a missing number.
  scenarios_json  jsonb NOT NULL DEFAULT '{}',
  assumptions_json jsonb NOT NULL DEFAULT '[]',
  -- §12.2: never present time savings as headcount reduction unless the client
  -- has explicitly confirmed that framing.
  headcount_reduction_confirmed boolean NOT NULL DEFAULT false,
  created_by    uuid REFERENCES users(id),
  updated_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, opportunity_id)
);
CREATE INDEX business_cases_scope_idx ON business_cases (workspace_id, assessment_id);

-- ─── Reports (§13) ────────────────────────────────────────────────────────────

CREATE TABLE report_versions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id        uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version              int NOT NULL,
  status               report_status NOT NULL DEFAULT 'draft',
  -- The eight §13.1 sections live here; the manifest records exactly which
  -- evidence produced them, so a finalised report is reproducible.
  content_json         jsonb NOT NULL DEFAULT '{}',
  source_manifest_json jsonb NOT NULL DEFAULT '{}',
  html_storage_key     text,
  pdf_storage_key      text,
  finalized_by         uuid REFERENCES users(id),
  finalized_at         timestamptz,
  created_by           uuid REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_versions_final_has_finalizer
    CHECK (status <> 'final' OR (finalized_by IS NOT NULL AND finalized_at IS NOT NULL)),
  UNIQUE (assessment_id, version)
);
CREATE INDEX report_versions_scope_idx ON report_versions (workspace_id, assessment_id);
-- §13.3 / §5.1: at most one live final version. A later change supersedes it
-- and creates a new version rather than editing history.
CREATE UNIQUE INDEX report_versions_single_final_idx
  ON report_versions (assessment_id) WHERE status = 'final';

/*
 * §5.1: "final is immutable."
 *
 * Enforced in the database rather than only in the service layer: a finalised
 * report is the artefact the client approved, and a stray UPDATE from a script
 * or a future code path would silently rewrite what they agreed to. Only the
 * transition to `superseded` is permitted.
 */
CREATE OR REPLACE FUNCTION report_versions_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'final' THEN
    IF NEW.status = 'superseded'
       AND NEW.content_json IS NOT DISTINCT FROM OLD.content_json
       AND NEW.source_manifest_json IS NOT DISTINCT FROM OLD.source_manifest_json
       AND NEW.version = OLD.version THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Report version % is final and immutable (PRD 5.1). Create a new version instead.',
      OLD.version
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER report_versions_immutable
  BEFORE UPDATE ON report_versions
  FOR EACH ROW EXECUTE FUNCTION report_versions_enforce_immutability();

CREATE TABLE approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  subject_type  approval_subject NOT NULL,
  subject_id    uuid NOT NULL,
  decision      approval_decision NOT NULL,
  comment       text,
  decided_by    uuid NOT NULL REFERENCES users(id),
  decided_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_scope_idx   ON approvals (workspace_id, assessment_id);
CREATE INDEX approvals_subject_idx ON approvals (subject_type, subject_id);

-- ─── Background jobs (§19) ────────────────────────────────────────────────────

CREATE TABLE jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id      uuid REFERENCES assessments(id) ON DELETE CASCADE,
  job_type           text NOT NULL,
  status             job_status NOT NULL DEFAULT 'queued',
  -- §19.2: idempotency is required. The unique constraint is what makes
  -- "re-running analysis for the same input version is a no-op" true rather
  -- than aspirational.
  idempotency_key    text UNIQUE NOT NULL,
  input_version      text NOT NULL,
  progress           int NOT NULL DEFAULT 0
    CONSTRAINT jobs_progress_range CHECK (progress BETWEEN 0 AND 100),
  attempt_count      int NOT NULL DEFAULT 0,
  error_code         text,
  -- §19.3: never expose a stack trace or provider message to a client.
  error_safe_message text,
  started_at         timestamptz,
  finished_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_scope_idx  ON jobs (workspace_id, assessment_id);
CREATE INDEX jobs_status_idx ON jobs (status, created_at);

-- Records which prompt and model produced each generated artefact (§10.2, §32.2).
CREATE TABLE model_invocations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id     uuid REFERENCES assessments(id) ON DELETE CASCADE,
  job_id            uuid REFERENCES jobs(id) ON DELETE SET NULL,
  prompt_name       text NOT NULL,
  prompt_version    text NOT NULL,
  model_identifier  text NOT NULL,
  determinism       text NOT NULL,
  response_checksum text NOT NULL,
  repair_attempts   int NOT NULL DEFAULT 0,
  input_tokens      int,
  output_tokens     int,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_invocations_scope_idx ON model_invocations (workspace_id, assessment_id);

-- ─── Audit (§24.2) ────────────────────────────────────────────────────────────

CREATE TABLE audit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id  uuid REFERENCES assessments(id) ON DELETE SET NULL,
  actor_user_id  uuid REFERENCES users(id),
  actor_type     actor_type NOT NULL,
  action         text NOT NULL,
  subject_type   text NOT NULL,
  subject_id     text NOT NULL,
  before_json    jsonb,
  after_json     jsonb,
  reason         text,
  -- Hashed, not raw: §22.3 keeps identifying network data out of the record.
  ip_hash        text,
  user_agent_hash text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_workspace_time_idx ON audit_events (workspace_id, created_at DESC);
CREATE INDEX audit_events_subject_idx        ON audit_events (subject_type, subject_id);

/*
 * §22.1: "Immutable audit events for sensitive changes."
 *
 * An audit log an operator can edit is not an audit log. Updates and deletes
 * are refused at the database level; retention is handled by the deletion
 * process in §22.4, which is permitted to remove content but not to rewrite it.
 */
CREATE OR REPLACE FUNCTION audit_events_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (PRD 22.1); % is not permitted.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_reject_mutation();

-- ─── updated_at maintenance ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'users', 'organizations', 'workspaces', 'workspace_users', 'assessments',
    'question_responses', 'campaigns', 'competitors', 'input_assets',
    'workflow_stages', 'brand_rules', 'opportunities', 'business_cases',
    'report_versions', 'jobs'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      target, target
    );
  END LOOP;
END;
$$;

COMMIT;
