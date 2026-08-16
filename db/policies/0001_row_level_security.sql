-- SignalScan — row-level security. PRD §17, §22.1, §32.3.
--
-- The tenant boundary is enforced in the database, not only in application
-- code. §22.2 is explicit that prompt instructions are never a security
-- control, and the same logic applies to service-layer WHERE clauses: one
-- forgotten filter in one query handler is a cross-client data leak.
--
-- Model
-- -----
-- The application connects as `signalscan_app`, which owns nothing and is
-- subject to every policy below. Migrations and the seed run as the schema
-- owner, which bypasses RLS by design — the same split as a managed provider's
-- `authenticated` versus `service_role`.
--
-- Identity comes from a per-transaction GUC:
--     SET LOCAL app.current_user_id = '<uuid>';
-- Set with SET LOCAL, never SET: a pooled connection that keeps a stale user id
-- would hand the next request someone else's workspaces.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'signalscan_app') THEN
    CREATE ROLE signalscan_app NOLOGIN;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO signalscan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO signalscan_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO signalscan_app;

-- ─── Session identity helpers ─────────────────────────────────────────────────

-- Returns NULL rather than raising when unset, so an unauthenticated
-- connection sees nothing instead of erroring in a way that leaks table names.
CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- Workspaces the current user is an ACTIVE member of. An invited-but-not-
-- accepted or disabled membership grants nothing.
CREATE OR REPLACE FUNCTION app_member_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wu.workspace_id
  FROM workspace_users wu
  WHERE wu.user_id = app_current_user_id()
    AND wu.status = 'active';
$$;

REVOKE ALL ON FUNCTION app_member_workspace_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_member_workspace_ids() TO signalscan_app;
GRANT EXECUTE ON FUNCTION app_current_user_id() TO signalscan_app;

-- ─── Workspace-scoped tables ──────────────────────────────────────────────────

-- Every table carrying workspace_id gets the identical policy. Generating them
-- in a loop means a new table cannot accidentally ship with a subtly different
-- predicate — the failure mode that makes hand-written policies dangerous.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'assessments', 'question_responses', 'campaigns', 'competitors',
    'input_assets', 'asset_chunks', 'evidence_citations', 'workflow_stages',
    'brand_rules', 'competitor_observations', 'opportunities',
    'opportunity_scores', 'business_cases', 'report_versions', 'approvals',
    'jobs', 'model_invocations', 'audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);

    EXECUTE format(
      'CREATE POLICY %I_workspace_isolation ON %I
         FOR ALL
         TO signalscan_app
         USING (workspace_id IN (SELECT app_member_workspace_ids()))
         WITH CHECK (workspace_id IN (SELECT app_member_workspace_ids()))',
      target, target
    );
  END LOOP;
END;
$$;

-- ─── Tenancy tables ───────────────────────────────────────────────────────────

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspaces_membership ON workspaces
  FOR ALL TO signalscan_app
  USING (id IN (SELECT app_member_workspace_ids()))
  WITH CHECK (id IN (SELECT app_member_workspace_ids()));

ALTER TABLE workspace_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_users_membership ON workspace_users
  FOR ALL TO signalscan_app
  USING (workspace_id IN (SELECT app_member_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT app_member_workspace_ids()));

-- Organisations are visible only through a workspace the user belongs to.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organizations_via_workspace ON organizations
  FOR SELECT TO signalscan_app
  USING (
    id IN (
      SELECT w.client_organization_id
      FROM workspaces w
      WHERE w.id IN (SELECT app_member_workspace_ids())
    )
  );

-- A user may read themselves, and anyone who shares a workspace with them.
-- §22.3 keeps the directory as small as the product actually needs.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self_and_co_members ON users
  FOR SELECT TO signalscan_app
  USING (
    id = app_current_user_id()
    OR id IN (
      SELECT wu.user_id
      FROM workspace_users wu
      WHERE wu.workspace_id IN (SELECT app_member_workspace_ids())
    )
  );

-- Question definitions are product configuration, not client data.
ALTER TABLE question_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY question_definitions_readable ON question_definitions
  FOR SELECT TO signalscan_app USING (true);

COMMIT;
