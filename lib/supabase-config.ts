// ============================================================
// 政策展台 2.0 — Supabase 配置
// 支持 v1 (policy_booth_policies) 和 v2 (policy_pages / jobs) 两套表
// ============================================================

// --- v1 旧表（保持兼容）---
const DEFAULT_V1_POLICY_TABLE = "policy_booth_policies";
const DEFAULT_V1_REVIEW_TABLE = "policy_booth_ai_reviews";

// --- v2 新表 ---
const DEFAULT_V2_POLICY_TABLE = "policy_pages";
const DEFAULT_V2_JOBS_TABLE = "jobs";
const DEFAULT_V2_TRANSLATION_QUEUE_TABLE = "translation_queue";

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
}

export function getSupabasePublishableKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ""
  );
}

export function getSupabaseSecretKey() {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

// --- v1 表名 ---
export function getV1PolicyTableName() {
  return process.env.POLICY_BOOTH_TABLE ?? DEFAULT_V1_POLICY_TABLE;
}

export function getV1ReviewTableName() {
  return process.env.POLICY_BOOTH_REVIEW_TABLE ?? DEFAULT_V1_REVIEW_TABLE;
}

// --- v1 兼容别名（被旧版 lib/supabase.ts 引用）---
export function getPolicyTableName() {
  return getV1PolicyTableName();
}

export function getPolicyReviewTableName() {
  return getV1ReviewTableName();
}

// --- v2 表名 ---
export function getV2PolicyTableName() {
  return process.env.V2_POLICY_TABLE ?? DEFAULT_V2_POLICY_TABLE;
}

export function getV2JobsTableName() {
  return process.env.V2_JOBS_TABLE ?? DEFAULT_V2_JOBS_TABLE;
}

export function getV2TranslationQueueTableName() {
  return process.env.V2_TRANSLATION_QUEUE_TABLE ?? DEFAULT_V2_TRANSLATION_QUEUE_TABLE;
}

// --- 环境检测 ---
export function hasSupabaseAuthEnv() {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

export function hasSupabaseAdminEnv() {
  return Boolean(getSupabaseUrl() && getSupabaseSecretKey());
}
