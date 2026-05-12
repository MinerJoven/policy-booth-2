-- Liuzi shared Supabase bootstrap for the policy booth module.
-- This script only creates objects prefixed with policy_booth_.
-- Do not rename this table to an existing Liuzi table.

CREATE TABLE IF NOT EXISTS policy_booth_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title_zh TEXT NOT NULL,
  title_de TEXT NOT NULL,
  publisher TEXT NOT NULL,
  official_url TEXT NOT NULL,
  published_at DATE NOT NULL,
  effective_at DATE,
  region_level TEXT NOT NULL CHECK (region_level IN ('联邦', '州', '市', 'Landkreis')),
  region_name TEXT NOT NULL,
  category TEXT NOT NULL,
  target_groups TEXT[] NOT NULL DEFAULT '{}',
  summary_zh TEXT NOT NULL,
  key_changes TEXT[] NOT NULL DEFAULT '{}',
  user_notes TEXT NOT NULL,
  impact_zh TEXT NOT NULL DEFAULT '',
  content_zh TEXT NOT NULL,
  content_de_summary TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'unpublished', 'expired')),
  superseded_by UUID REFERENCES policy_booth_policies(id),
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS policy_booth_policies_status_idx ON policy_booth_policies(status);
CREATE INDEX IF NOT EXISTS policy_booth_policies_category_idx ON policy_booth_policies(category);
CREATE INDEX IF NOT EXISTS policy_booth_policies_region_name_idx ON policy_booth_policies(region_name);
CREATE INDEX IF NOT EXISTS policy_booth_policies_region_level_idx ON policy_booth_policies(region_level);
CREATE INDEX IF NOT EXISTS policy_booth_policies_published_at_idx ON policy_booth_policies(published_at DESC);
CREATE INDEX IF NOT EXISTS policy_booth_policies_target_groups_idx ON policy_booth_policies USING GIN(target_groups);

CREATE TABLE IF NOT EXISTS policy_booth_ai_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES policy_booth_policies(id) ON DELETE CASCADE,
  policy_slug TEXT NOT NULL,
  official_url TEXT NOT NULL,
  review_status TEXT NOT NULL
    CHECK (review_status IN ('ok', 'needs_update', 'source_changed', 'source_unreachable', 'not_policy', 'uncertain')),
  confidence NUMERIC NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  findings TEXT[] NOT NULL DEFAULT '{}',
  suggested_action TEXT NOT NULL
    CHECK (suggested_action IN ('keep', 'update', 'unpublish', 'manual_check')),
  review_summary TEXT NOT NULL DEFAULT '',
  reviewed_model TEXT NOT NULL DEFAULT 'MiniMax-M2.7',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_hash TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS policy_booth_ai_reviews_policy_id_idx ON policy_booth_ai_reviews(policy_id);
CREATE INDEX IF NOT EXISTS policy_booth_ai_reviews_policy_slug_idx ON policy_booth_ai_reviews(policy_slug);
CREATE INDEX IF NOT EXISTS policy_booth_ai_reviews_reviewed_at_idx ON policy_booth_ai_reviews(reviewed_at DESC);
CREATE INDEX IF NOT EXISTS policy_booth_ai_reviews_status_idx ON policy_booth_ai_reviews(review_status);

ALTER TABLE policy_booth_ai_reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS policy_booth_ingest_runs (
  run_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('backfill', 'recent', 'resume')),
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed', 'failed')),
  source_id TEXT,
  source_index INTEGER NOT NULL DEFAULT 0,
  request_budget INTEGER NOT NULL DEFAULT 0,
  request_used INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  next_resume_at TIMESTAMPTZ,
  last_error TEXT,
  checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS policy_booth_ingest_runs_status_idx ON policy_booth_ingest_runs(status);
CREATE INDEX IF NOT EXISTS policy_booth_ingest_runs_next_resume_at_idx ON policy_booth_ingest_runs(next_resume_at);
CREATE INDEX IF NOT EXISTS policy_booth_ingest_runs_updated_at_idx ON policy_booth_ingest_runs(updated_at DESC);

ALTER TABLE policy_booth_ingest_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE policy_booth_policies
  DROP CONSTRAINT IF EXISTS policy_booth_policies_region_level_check;

-- Use Unicode escapes so copying through SQL Editor cannot corrupt Chinese literals.
ALTER TABLE policy_booth_policies
  ADD CONSTRAINT policy_booth_policies_region_level_check
  CHECK (region_level IN (U&'\8054\90A6', U&'\5DDE', U&'\5E02', 'Landkreis'));

CREATE OR REPLACE FUNCTION policy_booth_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS policy_booth_set_updated_at ON policy_booth_policies;
CREATE TRIGGER policy_booth_set_updated_at
  BEFORE UPDATE ON policy_booth_policies
  FOR EACH ROW EXECUTE FUNCTION policy_booth_update_updated_at();

ALTER TABLE policy_booth_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Policy booth public read published" ON policy_booth_policies;
CREATE POLICY "Policy booth public read published"
  ON policy_booth_policies FOR SELECT
  USING (status = 'published');

-- Admin writes are performed by server routes with SUPABASE_SECRET_KEY.
-- The browser only receives NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
