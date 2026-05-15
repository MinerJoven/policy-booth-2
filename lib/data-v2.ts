// ============================================================
// 政策展台 2.0 — 数据访问层 (v2)
// 对应 SPEC.md 第 3/4/5 节
// 与旧版 data.ts 完全独立，支持 policy_pages + jobs 表
// ============================================================

import type {
  JobV2,
  JobFiltersV2,
  JobListResultV2,
  PolicyV2,
  PolicyFiltersV2,
  PolicyListResultV2,
} from "@/lib/types-v2";
import {
  getSupabaseUrl,
  getSupabasePublishableKey,
  getSupabaseSecretKey,
  getV2PolicyTableName,
  getV2JobsTableName,
  hasSupabaseAdminEnv,
} from "@/lib/supabase-config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toPositiveInt } from "@/lib/utils";

// --- Client ---

let publicClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function getPublicClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) return null;
  if (!publicClient) {
    publicClient = createClient(url, key);
  }
  return publicClient;
}

function getAdminClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) return null;
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

// --- DB Row Types (snake_case) ---

type PolicyPageRow = {
  id: string;
  service_key: string;
  slug: string;
  title_zh: string;
  title_de: string;
  summary_zh: string;
  requirements_zh: string[];
  fees_zh: string;
  duration_zh: string;
  steps_zh: string[];
  region_level: string;
  region_name: string;
  category: string;
  tags: string[];
  publisher: string;
  source_url: string;
  source_name: string;
  translated: boolean;
  translated_at: string | null;
  content_hash: string | null;
  last_fetched_at: string;
  view_count: number;
  created_at: string;
  updated_at: string;
};

type JobRow = {
  refnr: string;
  title_de: string;
  title_zh: string | null;
  brief_zh: string | null;
  description_de: string | null;  // BA 详情页原始德语大段描述
  description_zh: string | null;  // description_de 中文翻译
  employer: string;
  city: string;
  state_code: string;
  work_type: string[];
  is_limited: boolean;
  entry_date: string | null;
  tags: string[];
  source_url: string;
  published_at: string | null;
  is_active: boolean;
  translated: boolean;
  translated_at: string | null;
  synced_at: string;
  created_at: string;
  updated_at: string;
};

// --- Row → Type Mappers ---

function rowToPolicyV2(r: PolicyPageRow): PolicyV2 {
  return {
    id: r.id,
    serviceKey: r.service_key,
    slug: r.slug,
    titleZh: r.title_zh,
    titleDe: r.title_de,
    summaryZh: r.summary_zh,
    requirementsZh: r.requirements_zh ?? [],
    feesZh: r.fees_zh ?? "",
    durationZh: r.duration_zh ?? "",
    stepsZh: r.steps_zh ?? [],
    regionLevel: r.region_level as PolicyV2["regionLevel"],
    regionName: r.region_name,
    category: r.category,
    tags: r.tags ?? [],
    publisher: r.publisher,
    sourceUrl: r.source_url,
    sourceName: r.source_name,
    translated: r.translated,
    translatedAt: r.translated_at ?? undefined,
    contentHash: r.content_hash ?? undefined,
    lastFetchedAt: r.last_fetched_at,
    viewCount: r.view_count ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToJobV2(r: JobRow): JobV2 {
  return {
    refnr: r.refnr,
    titleDe: r.title_de,
    titleZh: r.title_zh ?? undefined,
    briefZh: r.brief_zh ?? undefined,
    descriptionDe: r.description_de ?? undefined,
    descriptionZh: r.description_zh ?? undefined,
    employer: r.employer,
    city: r.city,
    stateCode: r.state_code,
    workType: r.work_type ?? [],
    isLimited: r.is_limited,
    entryDate: r.entry_date ?? undefined,
    tags: r.tags ?? [],
    sourceUrl: r.source_url,
    publishedAt: r.published_at ?? undefined,
    isActive: r.is_active,
    translated: r.translated,
    translatedAt: r.translated_at ?? undefined,
    syncedAt: r.synced_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --- Policy Queries ---

export async function listPoliciesData(
  filters: PolicyFiltersV2 = {},
  options?: { includeUntranslated?: boolean }
): Promise<PolicyListResultV2> {
  const client = getPublicClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  if (!client) {
    return { data: [], total: 0, page, pageSize };
  }

  try {
    let query = client
      .from(getV2PolicyTableName())
      .select("*", { count: "exact" });

    if (!options?.includeUntranslated) {
      query = query.eq("translated", true);
    }

    if (filters.category)      query = query.eq("category", filters.category);
    if (filters.regionLevel)   query = query.eq("region_level", filters.regionLevel);
    if (filters.regionName)    query = query.eq("region_name", filters.regionName);
    if (filters.tags?.length)  query = query.overlaps("tags", filters.tags);

    if (filters.query) {
      const q = filters.query;
      query = query.or(
        `title_zh.ilike.%${q}%,title_de.ilike.%${q}%,summary_zh.ilike.%${q}%`
      );
    }

    if (filters.sort === "view_count") {
      query = query.order("view_count", { ascending: false });
    } else if (filters.sort === "last_fetched") {
      query = query.order("last_fetched_at", { ascending: false });
    } else {
      query = query.order("last_fetched_at", { ascending: false });
    }

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: ((data ?? []) as PolicyPageRow[]).map(rowToPolicyV2),
      total: count ?? 0,
      page,
      pageSize,
    };
  } catch {
    return { data: [], total: 0, page, pageSize };
  }
}

export async function getPolicyBySlugData(slug: string): Promise<PolicyV2 | null> {
  const client = getPublicClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from(getV2PolicyTableName())
      .select("*")
      .eq("slug", slug)
      .eq("translated", true)
      .maybeSingle();
    if (error || !data) return null;
    return rowToPolicyV2(data as PolicyPageRow);
  } catch {
    return null;
  }
}

export async function getPolicyByIdData(id: string): Promise<PolicyV2 | null> {
  const client = getPublicClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from(getV2PolicyTableName())
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return rowToPolicyV2(data as PolicyPageRow);
  } catch {
    return null;
  }
}

export async function getCategoryStatsData(): Promise<Record<string, number>> {
  const client = getPublicClient();
  if (!client) return {};
  try {
    const { data } = await client
      .from(getV2PolicyTableName())
      .select("category", { count: "exact" })
      .eq("translated", true);
    const stats: Record<string, number> = {};
    (data ?? []).forEach((row: { category: string }) => {
      stats[row.category] = (stats[row.category] ?? 0) + 1;
    });
    return stats;
  } catch {
    return {};
  }
}

// --- Job Queries ---

export async function listJobsData(
  filters: JobFiltersV2 = {}
): Promise<JobListResultV2> {
  const client = getPublicClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  if (!client) {
    return { data: [], total: 0, page, pageSize };
  }

  try {
    let query = client
      .from(getV2JobsTableName())
      .select("*", { count: "exact" })
      .eq("is_active", true);

    if (filters.city)         query = query.eq("city", filters.city);
    if (filters.stateCode)    query = query.eq("state_code", filters.stateCode);
    if (filters.workType?.length) query = query.overlaps("work_type", filters.workType);
    if (filters.tags?.length) query = query.overlaps("tags", filters.tags);

    if (filters.query) {
      const q = filters.query;
      query = query.or(
        `title_zh.ilike.%${q}%,title_de.ilike.%${q}%,employer.ilike.%${q}%`
      );
    }

    query = query.order("published_at", { ascending: false });

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: ((data ?? []) as JobRow[]).map(rowToJobV2),
      total: count ?? 0,
      page,
      pageSize,
    };
  } catch {
    return { data: [], total: 0, page, pageSize };
  }
}

export async function getJobByRefnrData(refnr: string): Promise<JobV2 | null> {
  const client = getPublicClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from(getV2JobsTableName())
      .select("*")
      .eq("refnr", refnr)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) return null;
    return rowToJobV2(data as JobRow);
  } catch (e) {
    console.error("[getJobByRefnrData] error:", e);
    return null;
  }
}

// --- Search ---

export async function searchData(query: string): Promise<{
  policies: PolicyV2[];
  jobs: JobV2[];
}> {
  const client = getPublicClient();
  if (!client) return { policies: [], jobs: [] };
  try {
    const [policyResult, jobResult] = await Promise.all([
      client
        .from(getV2PolicyTableName())
        .select("*")
        .eq("translated", true)
        .or(`title_zh.ilike.%${query}%,title_de.ilike.%${query}%,summary_zh.ilike.%${query}%`)
        .limit(10),
      client
        .from(getV2JobsTableName())
        .select("*")
        .eq("translated", true)
        .eq("is_active", true)
        .or(`title_zh.ilike.%${query}%,title_de.ilike.%${query}%,employer.ilike.%${query}%`)
        .limit(10),
    ]);
    return {
      policies: ((policyResult.data ?? []) as PolicyPageRow[]).map(rowToPolicyV2),
      jobs: ((jobResult.data ?? []) as JobRow[]).map(rowToJobV2),
    };
  } catch {
    return { policies: [], jobs: [] };
  }
}

// --- URL Filter Parsers ---

export function parseFiltersFromUrl(url: URL): PolicyFiltersV2 {
  return {
    regionLevel: url.searchParams.get("region_level") ?? undefined,
    regionName:  url.searchParams.get("region_name") ?? undefined,
    category:     url.searchParams.get("category") ?? undefined,
    tags:         url.searchParams.getAll("tag"),
    sort:         (url.searchParams.get("sort") as PolicyFiltersV2["sort"]) ?? undefined,
    query:        url.searchParams.get("q") ?? undefined,
    page:         toPositiveInt(url.searchParams.get("page") ?? undefined, 1),
    pageSize:     toPositiveInt(url.searchParams.get("page_size") ?? undefined, 20),
  };
}

export function parseJobFiltersFromUrl(url: URL): JobFiltersV2 {
  return {
    city:      url.searchParams.get("city") ?? undefined,
    stateCode: url.searchParams.get("state_code") ?? undefined,
    workType:  url.searchParams.getAll("work_type"),
    tags:      url.searchParams.getAll("tag"),
    query:     url.searchParams.get("q") ?? undefined,
    page:      toPositiveInt(url.searchParams.get("page") ?? undefined, 1),
    pageSize:  toPositiveInt(url.searchParams.get("page_size") ?? undefined, 20),
  };
}
