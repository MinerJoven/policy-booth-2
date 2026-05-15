-- ============================================================
-- 扩展 jobs 表：加 description_de / description_zh 字段
-- 职位详情页的大段描述内容
-- ============================================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS description_de TEXT,
  ADD COLUMN IF NOT EXISTS description_zh TEXT;

-- 注释（方便 Supabase 控制台查看）
COMMENT ON COLUMN jobs.description_de IS 'BA 详情页原始德语大段描述（公司介绍、岗位职责、要求、福利等）';
COMMENT ON COLUMN jobs.description_zh IS 'description_de 的中文翻译';

-- 给现有字段加注释
COMMENT ON COLUMN jobs.brief_zh IS '两句话中文岗位摘要（AI 生成，非原文翻译）';

-- 已有数据不需要回填，爬虫会在下次同步时更新 description_de
