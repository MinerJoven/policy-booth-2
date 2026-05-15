// ============================================================
// 政策展台 2.0 — v2 类型定义 (新增，与 v1 完全独立)
// 对应 SPEC.md 3.2 / 3.3 节
// 使用 camelCase + v2 专用表 policy_pages / jobs
// ============================================================

// --- 地区层级 ---
export type RegionLevelV2 = "联邦" | "州" | "市" | "Landkreis";

// --- 政策内容 (policy_pages) ---
export interface PolicyV2 {
  // 基础标识
  id: string;
  serviceKey: string;
  slug: string;

  // 标题与摘要
  titleZh: string;
  titleDe: string;
  summaryZh: string;

  // 结构化信息
  requirementsZh: string[];  // 所需材料
  feesZh: string;            // 费用说明
  durationZh: string;        // 办理时限
  stepsZh: string[];         // 办理步骤

  // 分类
  regionLevel: RegionLevelV2;
  regionName: string;
  category: string;
  tags: string[];

  // 来源
  publisher: string;
  sourceUrl: string;
  sourceName: string;

  // 翻译状态
  translated: boolean;
  translatedAt?: string;

  // 变更检测
  contentHash?: string;
  lastFetchedAt: string;

  // 统计
  viewCount: number;

  // 时间戳
  createdAt: string;
  updatedAt: string;
}

// --- 招聘信息 (jobs) ---
export interface JobV2 {
  refnr: string;
  titleDe: string;
  titleZh?: string;
  briefZh?: string;
  descriptionDe?: string;   // BA 详情页原始德语大段描述
  descriptionZh?: string;  // description_de 中文翻译
  employer: string;
  city: string;
  stateCode: string;
  workType: string[];
  isLimited: boolean;
  entryDate?: string;
  tags: string[];
  sourceUrl: string;
  publishedAt?: string;
  isActive: boolean;
  translated: boolean;
  translatedAt?: string;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

// --- 翻译队列表 ---
export type TranslationSourceType = "policy" | "job";
export type TranslationStatus = "pending" | "processing" | "done" | "failed" | "skipped";

export interface TranslationQueueItem {
  id: string;
  sourceType: TranslationSourceType;
  sourceId: string;
  sourceUrl?: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  status: TranslationStatus;
  errorMessage?: string;
  createdAt: string;
  processedAt?: string;
}

// --- 筛选器 ---
export interface PolicyFiltersV2 {
  regionLevel?: string;
  regionName?: string;
  category?: string;
  tags?: string[];
  sort?: "last_fetched" | "published_at" | "view_count";
  page?: number;
  pageSize?: number;
  query?: string;
}

export interface JobFiltersV2 {
  city?: string;
  stateCode?: string;
  workType?: string[];
  tags?: string[];
  page?: number;
  pageSize?: number;
  query?: string;
}

// --- 列表响应 ---
export interface PolicyListResultV2 {
  data: PolicyV2[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JobListResultV2 {
  data: JobV2[];
  total: number;
  page: number;
  pageSize: number;
}
