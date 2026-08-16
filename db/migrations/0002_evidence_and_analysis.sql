-- SignalScan 0002 — evidence, campaign flow, brand intelligence, opportunities.
-- PRD §17.1 continued.

BEGIN;

-- ─── Evidence (§6) ────────────────────────────────────────────────────────────

CREATE TABLE campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id    uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  title            text NOT NULL,
  campaign_date    date,
  product          text,
  market           text,
  audience         text,
  objective        text,
  channels         text[] NOT NULL DEFAULT '{}',
  brand_label      brand_label NOT NULL DEFAULT 'unknown',
  performance_json jsonb,
  metadata_json    jsonb NOT NULL DEFAULT '{}',
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_scope_idx ON campaigns (workspace_id, assessment_id);
CREATE INDEX campaigns_date_idx  ON campaigns (assessment_id, campaign_date);

CREATE TABLE competitors (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id      uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  name               text NOT NULL,
  official_url       text NOT NULL,
  social_url         text,
  rationale          text NOT NULL,
  desired_difference text,
  status             competitor_status NOT NULL DEFAULT 'proposed',
  confirmed_by       uuid REFERENCES users(id),
  confirmed_at       timestamptz,
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, name)
);
CREATE INDEX competitors_scope_idx ON competitors (workspace_id, assessment_id);

CREATE TABLE input_assets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id       uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  campaign_id         uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  competitor_id       uuid REFERENCES competitors(id) ON DELETE SET NULL,
  category            input_asset_category NOT NULL,
  status              asset_status NOT NULL DEFAULT 'uploading',
  original_name       text NOT NULL,
  mime_type           text NOT NULL,
  size_bytes          bigint NOT NULL CONSTRAINT input_assets_size_positive CHECK (size_bytes >= 0),
  sha256              text NOT NULL CONSTRAINT input_assets_sha256_format CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_key         text NOT NULL,
  source_url          text,
  observation_date    date,
  parse_error_code    text,
  -- §6.3: retention is set at upload so the sweep never has to guess.
  retention_delete_at timestamptz NOT NULL,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, sha256, storage_key)
);
CREATE INDEX input_assets_scope_idx    ON input_assets (workspace_id, assessment_id);
CREATE INDEX input_assets_triage_idx   ON input_assets (assessment_id, category, status);
CREATE INDEX input_assets_sha256_idx   ON input_assets (sha256);
CREATE INDEX input_assets_retention_idx ON input_assets (retention_delete_at);

CREATE TABLE asset_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  asset_id      uuid NOT NULL REFERENCES input_assets(id) ON DELETE CASCADE,
  chunk_index   int NOT NULL,
  content       text NOT NULL,
  -- Page / slide / sheet / cell, so a citation can point at a real location.
  location_json jsonb NOT NULL DEFAULT '{}',
  embedding     vector(1536),
  content_hash  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, chunk_index)
);
CREATE INDEX asset_chunks_scope_idx ON asset_chunks (workspace_id, assessment_id);
-- §20.3: retrieval filters by workspace and assessment BEFORE vector similarity.
-- The composite index exists so that filter is cheap enough that nobody is
-- ever tempted to skip it.
CREATE INDEX asset_chunks_retrieval_idx ON asset_chunks (workspace_id, assessment_id, asset_id);

CREATE TABLE evidence_citations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id    uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  asset_id         uuid REFERENCES input_assets(id) ON DELETE CASCADE,
  chunk_id         uuid REFERENCES asset_chunks(id) ON DELETE CASCADE,
  source_url       text,
  location_json    jsonb NOT NULL DEFAULT '{}',
  evidence_excerpt text NOT NULL,
  excerpt_hash     text NOT NULL,
  created_by_type  citation_author_type NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- A citation with no source at all is not a citation.
  CONSTRAINT evidence_citations_has_source
    CHECK (asset_id IS NOT NULL OR chunk_id IS NOT NULL OR source_url IS NOT NULL)
);
CREATE INDEX evidence_citations_scope_idx ON evidence_citations (workspace_id, assessment_id);
CREATE INDEX evidence_citations_asset_idx ON evidence_citations (asset_id);
CREATE INDEX evidence_citations_chunk_idx ON evidence_citations (chunk_id);

-- ─── Campaign flow (§8) ───────────────────────────────────────────────────────

CREATE TABLE workflow_stages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id        uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  variant              flow_variant NOT NULL DEFAULT 'observed',
  order_number         int NOT NULL,
  name                 text NOT NULL,
  description          text,
  trigger              text NOT NULL DEFAULT '',
  input_asset_ids      uuid[] NOT NULL DEFAULT '{}',
  owner_role           text NOT NULL,
  contributor_roles    text[] NOT NULL DEFAULT '{}',
  approver_roles       text[] NOT NULL DEFAULT '{}',
  tool_names           text[] NOT NULL DEFAULT '{}',
  actions              text[] NOT NULL DEFAULT '{}',
  outputs              text[] NOT NULL DEFAULT '{}',
  work_time_minutes    int,
  elapsed_time_minutes int,
  wait_time_minutes    int,
  rework_frequency     text,
  rework_reasons       text[] NOT NULL DEFAULT '{}',
  risk_tags            text[] NOT NULL DEFAULT '{}',
  source_citation_ids  uuid[] NOT NULL DEFAULT '{}',
  capture_method       stage_capture_method NOT NULL DEFAULT 'manual',
  status               stage_status NOT NULL DEFAULT 'draft',
  validated_by         uuid REFERENCES users(id),
  validated_at         timestamptz,
  created_by           uuid REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- §8.4: work time must not exceed elapsed time. Enforced in the database as
  -- well as the domain layer — an impossible duration must not be storable.
  CONSTRAINT workflow_stages_work_within_elapsed
    CHECK (work_time_minutes IS NULL OR elapsed_time_minutes IS NULL
           OR work_time_minutes <= elapsed_time_minutes),
  UNIQUE (assessment_id, variant, order_number)
);
CREATE INDEX workflow_stages_scope_idx ON workflow_stages (workspace_id, assessment_id);
CREATE INDEX workflow_stages_order_idx ON workflow_stages (assessment_id, order_number);

-- ─── Brand intelligence (§9) ──────────────────────────────────────────────────

CREATE TABLE brand_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id       uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  category            brand_rule_category NOT NULL,
  rule                text NOT NULL,
  origin              brand_rule_origin NOT NULL,
  evidence_count      int NOT NULL DEFAULT 0,
  source_citation_ids uuid[] NOT NULL DEFAULT '{}',
  confidence          numeric(5,4) NOT NULL DEFAULT 0
    CONSTRAINT brand_rules_confidence_range CHECK (confidence BETWEEN 0 AND 1),
  status              brand_rule_status NOT NULL DEFAULT 'pending',
  reviewed_by         uuid REFERENCES users(id),
  reviewed_at         timestamptz,
  reviewer_comment    text,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- §32.2: every finalizable factual rule must carry a citation. An inferred or
  -- extracted rule with no evidence cannot be approved.
  CONSTRAINT brand_rules_evidence_required
    CHECK (origin = 'human_added' OR cardinality(source_citation_ids) > 0)
);
CREATE INDEX brand_rules_scope_idx  ON brand_rules (workspace_id, assessment_id);
CREATE INDEX brand_rules_triage_idx ON brand_rules (assessment_id, category, status);
CREATE INDEX brand_rules_origin_idx ON brand_rules (assessment_id, origin);

CREATE TABLE competitor_observations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id       uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  competitor_id       uuid REFERENCES competitors(id) ON DELETE CASCADE,
  axis                text NOT NULL,
  observation         text NOT NULL,
  classification      text NOT NULL,
  source_citation_ids uuid[] NOT NULL DEFAULT '{}',
  observed_at         date,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competitor_observations_classification_valid CHECK (
    classification IN ('distinctive_to_client', 'shared_with_competitor',
                       'category_convention', 'competitor_distinctive', 'unproven')
  )
);
CREATE INDEX competitor_observations_scope_idx ON competitor_observations (workspace_id, assessment_id);

-- ─── Opportunities and scores (§10, §11) ──────────────────────────────────────

CREATE TABLE opportunities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id       uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  analysis_version    int NOT NULL DEFAULT 1,
  name                text NOT NULL,
  outcome             text NOT NULL,
  workflow_stage_ids  uuid[] NOT NULL DEFAULT '{}',
  trigger             text NOT NULL DEFAULT '',
  required_inputs     text[] NOT NULL DEFAULT '{}',
  agent_actions       text[] NOT NULL DEFAULT '{}',
  human_gates         text[] NOT NULL DEFAULT '{}',
  outputs             text[] NOT NULL DEFAULT '{}',
  value_hypothesis    text NOT NULL DEFAULT '',
  baseline_assumptions jsonb NOT NULL DEFAULT '[]',
  dependencies        jsonb NOT NULL DEFAULT '[]',
  risks               jsonb NOT NULL DEFAULT '[]',
  owner_role          text,
  kpi                 text,
  source_citation_ids uuid[] NOT NULL DEFAULT '{}',
  hard_stops_json     jsonb NOT NULL DEFAULT '[]',
  strategist_status   strategist_status NOT NULL DEFAULT 'draft',
  -- §4.3: draft rankings stay invisible to the client until shared.
  shared_with_client  boolean NOT NULL DEFAULT false,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunities_scope_idx  ON opportunities (workspace_id, assessment_id);
CREATE INDEX opportunities_status_idx ON opportunities (assessment_id, strategist_status);
-- §13.3: exactly one recommended opportunity per analysis version.
CREATE UNIQUE INDEX opportunities_single_recommendation_idx
  ON opportunities (assessment_id, analysis_version)
  WHERE strategist_status = 'recommended';

CREATE TABLE opportunity_scores (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assessment_id         uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  opportunity_id        uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  score_version         int NOT NULL DEFAULT 1,
  factor_version        text NOT NULL,
  factors_json          jsonb NOT NULL,
  raw_score             numeric(5,2) NOT NULL
    CONSTRAINT opportunity_scores_raw_range CHECK (raw_score BETWEEN 0 AND 100),
  confidence_score      numeric(5,4) NOT NULL
    CONSTRAINT opportunity_scores_confidence_range CHECK (confidence_score BETWEEN 0 AND 1),
  confidence_multiplier numeric(5,4) NOT NULL
    CONSTRAINT opportunity_scores_multiplier_range CHECK (confidence_multiplier BETWEEN 0.6 AND 1),
  priority_score        numeric(5,2) NOT NULL
    CONSTRAINT opportunity_scores_priority_range CHECK (priority_score BETWEEN 0 AND 100),
  priority_band         priority_band NOT NULL,
  hard_stops_json       jsonb NOT NULL DEFAULT '[]',
  calculated_by         uuid REFERENCES users(id),
  calculated_at         timestamptz NOT NULL DEFAULT now(),
  -- §11.5: a hard stop must produce the blocked band. Enforced here so no code
  -- path — including a future one — can persist a "recommend" that is blocked.
  CONSTRAINT opportunity_scores_hard_stop_blocks
    CHECK (jsonb_array_length(hard_stops_json) = 0 OR priority_band = 'blocked'),
  UNIQUE (opportunity_id, score_version)
);
CREATE INDEX opportunity_scores_scope_idx ON opportunity_scores (workspace_id, assessment_id);

COMMIT;
