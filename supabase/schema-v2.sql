-- ============================================================
-- 政策展台 2.0 (Policy Booth 2.0) — Supabase Schema
-- 基于 "德区政策展台_技术开发文档_v1.0.docx" (2025) 重新设计
-- 与旧 schema (policy_booth_policies) 完全独立，互不影响
-- ============================================================

-- ------------------------------------------------------------
-- 1. 政策内容表：policy_pages
--    来源：Windows 文档 3.3 节 "内容结构设计（每条政策的字段）"
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS policy_pages (
  -- 基础标识
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key       TEXT UNIQUE NOT NULL,          -- 全局唯一键，如 aufenthaltserlaubnis_studium
  slug              TEXT UNIQUE NOT NULL,           -- URL 友好标识符

  -- 标题与摘要
  title_zh          TEXT NOT NULL,                  -- 中文标题（AI 翻译）
  title_de          TEXT NOT NULL,                  -- 德文原始标题
  summary_zh        TEXT NOT NULL,                  -- 300字以内中文摘要（AI 提炼，非原文直译）

  -- 结构化信息（核心差异于 v1）
  requirements_zh   JSONB NOT NULL DEFAULT '[]',    -- 所需材料数组，如 ["有效护照","健康保险证明"]
  fees_zh           TEXT NOT NULL DEFAULT '',       -- 费用说明，如「约 100–110 欧元」
  duration_zh       TEXT NOT NULL DEFAULT '',       -- 办理时限，如「通常 4–8 周」
  steps_zh          JSONB NOT NULL DEFAULT '[]',   -- 办理步骤数组

  -- 分类信息
  region_level      TEXT NOT NULL,
  region_name       TEXT NOT NULL,
  category          TEXT NOT NULL,                  -- 政策类别
  tags              TEXT[] NOT NULL DEFAULT '{}',   -- 分类标签，如 ["居留","留学生"]

  -- 来源信息
  publisher         TEXT NOT NULL,                  -- 发布机构名称
  source_url        TEXT NOT NULL,                  -- 原始官方页面 URL
  source_name       TEXT NOT NULL,                  -- 来源机构名，如「联邦移民局（BAMF）」

  -- 翻译状态
  translated        BOOLEAN NOT NULL DEFAULT FALSE,
  translated_at     TIMESTAMPTZ,                    -- 最近一次翻译时间

  -- 变更检测
  content_hash      TEXT,                           -- 原文 MD5，用于变更检测
  last_fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 统计
  view_count        INTEGER NOT NULL DEFAULT 0,

  -- 时间戳
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 约束
  CONSTRAINT policy_pages_region_level_check
    CHECK (region_level IN (U&'\8054\90A6', U&'\5DDE', U&'\5E02', 'Landkreis'))
);

-- 索引
CREATE INDEX IF NOT EXISTS policy_pages_service_key_idx ON policy_pages(service_key);
CREATE INDEX IF NOT EXISTS policy_pages_slug_idx ON policy_pages(slug);
CREATE INDEX IF NOT EXISTS policy_pages_translated_idx ON policy_pages(translated);
CREATE INDEX IF NOT EXISTS policy_pages_category_idx ON policy_pages(category);
CREATE INDEX IF NOT EXISTS policy_pages_region_name_idx ON policy_pages(region_name);
CREATE INDEX IF NOT EXISTS policy_pages_region_level_idx ON policy_pages(region_level);
CREATE INDEX IF NOT EXISTS policy_pages_tags_idx ON policy_pages USING GIN(tags);
CREATE INDEX IF NOT EXISTS policy_pages_last_fetched_idx ON policy_pages(last_fetched_at DESC);

-- ------------------------------------------------------------
-- 2. 招聘信息表：jobs
--    来源：Windows 文档 4.3 节 "招聘数据表设计"
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jobs (
  -- 主键
  refnr             TEXT PRIMARY KEY,               -- BA 岗位唯一编号

  -- 职位信息
  title_de          TEXT NOT NULL,                  -- 原始德语职位名
  title_zh          TEXT,                           -- 中文职位名（AI 翻译，≤20字）
  brief_zh          TEXT,                           -- 两句话中文岗位摘要（AI 生成）

  -- 雇主与地点
  employer          TEXT NOT NULL,                   -- 雇主名称
  city              TEXT NOT NULL,                   -- 工作城市
  state_code        TEXT NOT NULL,                   -- 所属州代码（BW/BY/BE 等）

  -- 工作类型
  work_type         TEXT[] NOT NULL DEFAULT '{}',   -- 工作类型数组，如 ["全职","远程"]
  is_limited        BOOLEAN NOT NULL DEFAULT FALSE,  -- 是否固定期限合同
  entry_date        DATE,                           -- 入职日期

  -- 华人特供标签
  tags              TEXT[] NOT NULL DEFAULT '{}',    -- 如 ["留学生适合","需要中文","远程办公"]

  -- 职位详情大段描述
  description_de    TEXT,                           -- BA 详情页原始德语描述（公司介绍/职责/要求/福利）
  description_zh    TEXT,                           -- description_de 中文翻译

  -- 来源
  source_url        TEXT NOT NULL,                   -- BA 原始详情页链接
  published_at      DATE,                           -- BA 平台上架日期

  -- 同步状态
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,   -- false 表示 BA 已下架
  translated        BOOLEAN NOT NULL DEFAULT FALSE,
  translated_at     TIMESTAMPTZ,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 时间戳
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS jobs_refnr_idx ON jobs(refnr);
CREATE INDEX IF NOT EXISTS jobs_translated_idx ON jobs(translated);
CREATE INDEX IF NOT EXISTS jobs_is_active_idx ON jobs(is_active);
CREATE INDEX IF NOT EXISTS jobs_city_idx ON jobs(city);
CREATE INDEX IF NOT EXISTS jobs_state_code_idx ON jobs(state_code);
CREATE INDEX IF NOT EXISTS jobs_published_at_idx ON jobs(published_at DESC);
CREATE INDEX IF NOT EXISTS jobs_tags_idx ON jobs USING GIN(tags);
CREATE INDEX IF NOT EXISTS jobs_work_type_idx ON jobs USING GIN(work_type);

-- ------------------------------------------------------------
-- 3. 统一翻译队列表：translation_queue
--    来源：Windows 文档 5.1 节 "翻译触发逻辑"
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS translation_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     TEXT NOT NULL CHECK (source_type IN ('policy', 'job')),
  source_id       TEXT NOT NULL,                   -- policy_pages.id 或 jobs.refnr
  source_url      TEXT,                             -- 用于 AI 复核时抓取
  priority        INTEGER NOT NULL DEFAULT 0,        -- 数字越大越优先
  attempts        INTEGER NOT NULL DEFAULT 0,        -- 已尝试次数
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS translation_queue_status_idx ON translation_queue(status);
CREATE INDEX IF NOT EXISTS translation_queue_priority_idx ON translation_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS translation_queue_source_idx ON translation_queue(source_type, source_id);

-- ------------------------------------------------------------
-- 4. 复用已有表（来自 v1 schema）
-- ------------------------------------------------------------

-- AI 复核记录表（已有，复用）
CREATE TABLE IF NOT EXISTS policy_booth_ai_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES policy_pages(id) ON DELETE CASCADE,
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

-- 采集运行记录表（已有，复用）
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

-- ------------------------------------------------------------
-- 5. 自动更新 updated_at 触发器
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS policy_pages_set_updated_at ON policy_pages;
CREATE TRIGGER policy_pages_set_updated_at
  BEFORE UPDATE ON policy_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS jobs_set_updated_at ON jobs;
CREATE TRIGGER jobs_set_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 6. Row Level Security (RLS)
-- ------------------------------------------------------------

-- policy_pages: 公开只读已翻译内容
ALTER TABLE policy_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Policy pages public read" ON policy_pages;
CREATE POLICY "Policy pages public read"
  ON policy_pages FOR SELECT
  USING (translated = TRUE);

-- jobs: 公开只读已翻译且活跃内容
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Jobs public read" ON jobs;
CREATE POLICY "Jobs public read"
  ON jobs FOR SELECT
  USING (translated = TRUE AND is_active = TRUE);

-- translation_queue: 仅服务端可读写
ALTER TABLE translation_queue ENABLE ROW LEVEL SECURITY;

-- policy_booth_ai_reviews: 仅服务端可读写
ALTER TABLE policy_booth_ai_reviews ENABLE ROW LEVEL SECURITY;

-- policy_booth_ingest_runs: 仅服务端可读写
ALTER TABLE policy_booth_ingest_runs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 7. 注释（方便 Supabase 控制台查看）
-- ------------------------------------------------------------

COMMENT ON TABLE policy_pages IS '政策内容主表 v2.0，对应 Windows 文档 3.3 节';
COMMENT ON TABLE jobs IS '招聘信息主表 v2.0，对应 Windows 文档 4.3 节';
COMMENT ON TABLE translation_queue IS '统一翻译队列表 v2.0，对应 Windows 文档 5.1 节';
COMMENT ON COLUMN policy_pages.service_key IS '全局唯一键，如 aufenthaltserlaubnis_studium';
COMMENT ON COLUMN policy_pages.requirements_zh IS '所需材料 JSONB 数组，如 ["有效护照","健康保险证明"]';
COMMENT ON COLUMN policy_pages.content_hash IS '原文 MD5，用于 ETag 增量检测变更';
COMMENT ON COLUMN jobs.refnr IS 'BA 岗位唯一编号，作为主键用于去重';
COMMENT ON COLUMN jobs.tags IS '华人特供标签，如 ["留学生适合","需要中文","远程办公"]';
COMMENT ON COLUMN translation_queue.source_type IS 'policy 或 job，决定 source_id 的含义';
