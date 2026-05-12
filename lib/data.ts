import { mockPolicies } from "@/lib/mock-policies";
import type { Policy, PolicyFilters, PolicyListResult, PolicyStatus, RiskLevel } from "@/lib/types";
import { getSingleParam, includesText, normalizeText, toPositiveInt } from "@/lib/utils";
import { hasSupabaseAdminEnv, hasSupabaseAuthEnv } from "@/lib/supabase-config";
import { getPoliciesTable, getSupabaseAdminClient, getSupabasePublicClient } from "@/lib/supabase";
import { getRegionGroups, matchesRegionName, normalizePolicyForDisplay } from "@/lib/policy-taxonomy";
import type { SupabaseClient } from "@supabase/supabase-js";

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3
};

const POLICY_STATUSES: PolicyStatus[] = ["draft", "published", "unpublished", "expired"];

export function isSupabaseConfigured() {
  return hasSupabaseAdminEnv();
}

export function getDataSourceLabel() {
  if (isSupabaseConfigured()) {
    return "Liuzi Supabase";
  }

  return hasSupabaseAuthEnv() ? "Liuzi Supabase Auth" : "本地示例数据";
}

export function parseFiltersFromSearchParams(
  searchParams?: Record<string, string | string[] | undefined>
): PolicyFilters {
  const page = toPositiveInt(getSingleParam(searchParams?.page), 1);
  const pageSize = toPositiveInt(getSingleParam(searchParams?.page_size), 20);

  return {
    regionLevel: getSingleParam(searchParams?.region_level),
    regionName: getSingleParam(searchParams?.region_name),
    category: getSingleParam(searchParams?.category),
    targetGroup: getSingleParam(searchParams?.target_group),
    days: getSingleParam(searchParams?.days),
    dateFrom: getSingleParam(searchParams?.date_from),
    dateTo: getSingleParam(searchParams?.date_to),
    sort: getSingleParam(searchParams?.sort) as PolicyFilters["sort"],
    query: getSingleParam(searchParams?.q),
    status: getSingleParam(searchParams?.status),
    page,
    pageSize
  };
}

export function parseFiltersFromUrl(url: URL): PolicyFilters {
  return {
    regionLevel: url.searchParams.get("region_level") ?? undefined,
    regionName: url.searchParams.get("region_name") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    targetGroup: url.searchParams.get("target_group") ?? undefined,
    days: url.searchParams.get("days") ?? undefined,
    dateFrom: url.searchParams.get("date_from") ?? undefined,
    dateTo: url.searchParams.get("date_to") ?? undefined,
    sort: (url.searchParams.get("sort") as PolicyFilters["sort"]) ?? undefined,
    query: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    page: toPositiveInt(url.searchParams.get("page") ?? undefined, 1),
    pageSize: toPositiveInt(url.searchParams.get("page_size") ?? undefined, 20)
  };
}

export function listPolicies(filters: PolicyFilters = {}, options?: { includeHidden?: boolean }): PolicyListResult {
  const includeHidden = options?.includeHidden ?? false;
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const data = sortPolicies(
    filterPoliciesForDisplay(mockPolicies.map(normalizePolicyForDisplay), filters, { includeHidden }),
    filters.sort
  );

  const total = data.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    data: data.slice(start, end),
    total,
    page,
    pageSize
  };
}

export async function listPoliciesData(
  filters: PolicyFilters = {},
  options?: { includeHidden?: boolean }
): Promise<PolicyListResult> {
  const includeHidden = options?.includeHidden ?? false;
  const supabase = includeHidden ? getSupabaseAdminClient() : getSupabasePublicClient();

  if (!supabase) {
    return listPolicies(filters, options);
  }

  try {
    return await queryPolicies(supabase, filters, { includeHidden });
  } catch {
    return listPolicies(filters, options);
  }
}

export async function getPolicyBySlugData(slug: string, options?: { includeHidden?: boolean }) {
  const policy = await getPolicyByFieldData("slug", slug, options);
  return policy ?? getPolicyBySlug(slug);
}

export async function getAdminPolicyStatsData() {
  const supabase = getSupabaseAdminClient();

  if (supabase) {
    try {
      const [total, highRisk, ...statusCounts] = await Promise.all([
        countPolicies(supabase),
        countPolicies(supabase, { riskLevel: "high" }),
        ...POLICY_STATUSES.map((status) => countPolicies(supabase, { status }))
      ]);

      return {
        total,
        highRisk,
        statusCounts: Object.fromEntries(POLICY_STATUSES.map((status, index) => [status, statusCounts[index]])) as Record<
          PolicyStatus,
          number
        >
      };
    } catch {
      // Fall through to local/mock aggregation.
    }
  }

  const result = await listPoliciesData({ pageSize: 5000 }, { includeHidden: true });
  const statusCounts = Object.fromEntries(POLICY_STATUSES.map((status) => [status, 0])) as Record<PolicyStatus, number>;
  let highRisk = 0;

  result.data.forEach((policy) => {
    statusCounts[policy.status] += 1;
    if (policy.riskLevel === "high") highRisk += 1;
  });

  return {
    total: result.total,
    highRisk,
    statusCounts
  };
}

export async function getPolicyByIdData(id: string, options?: { includeHidden?: boolean }) {
  const policy = await getPolicyByFieldData("id", id, options);
  return policy ?? getPolicyById(id);
}

export async function getRelatedPoliciesData(policy: Policy, limit = 3) {
  const result = await listPoliciesData({ pageSize: 500 });
  const related = result.data
    .filter((item) => item.status === "published" && item.id !== policy.id)
    .map((item) => {
      let score = 0;
      if (item.regionName === policy.regionName) score += 3;
      if (item.category === policy.category) score += 3;
      if (item.publisher === policy.publisher) score += 2;
      if (item.targetGroups.some((group) => policy.targetGroups.includes(group))) score += 1;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.item.publishedAt.localeCompare(a.item.publishedAt))
    .slice(0, limit)
    .map(({ item }) => item);

  return related.length > 0 ? related : getRelatedPolicies(policy, limit);
}

export async function getCategoryStatsData() {
  const result = await listPoliciesData({ pageSize: 1000 });
  return result.data.reduce<Record<string, number>>((acc, policy) => {
    acc[policy.category] = (acc[policy.category] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getTargetGroupStatsData() {
  const result = await listPoliciesData({ pageSize: 1000 });
  return result.data.reduce<Record<string, number>>((acc, policy) => {
    policy.targetGroups.forEach((group) => {
      acc[group] = (acc[group] ?? 0) + 1;
    });
    return acc;
  }, {});
}

export async function getRegionStatsData() {
  const result = await listPoliciesData({ pageSize: 1000 });
  return result.data.reduce<Record<string, number>>((acc, policy) => {
    acc[policy.regionName] = (acc[policy.regionName] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getRegionGroupsData() {
  const result = await listPoliciesData({ pageSize: 1000 });
  return getRegionGroups(result.data);
}

export async function getSearchSuggestionsData() {
  const result = await listPoliciesData({ pageSize: 200 });
  const terms = new Set<string>();

  result.data.forEach((policy) => {
    terms.add(policy.category);
    terms.add(policy.regionName);
    policy.targetGroups.forEach((group) => terms.add(group));
    normalizeText(policy.titleDe)
      .split(" ")
      .filter((word) => word.length > 4)
      .forEach((word) => terms.add(word));
  });

  return [...terms].slice(0, 12);
}

export function sortPolicies(data: Policy[], sort: PolicyFilters["sort"] = "published_at") {
  return [...data].sort((a, b) => {
    if (sort === "effective_at") {
      return (b.effectiveAt ?? b.publishedAt).localeCompare(a.effectiveAt ?? a.publishedAt);
    }

    if (sort === "risk_level") {
      return RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel];
    }

    if (sort === "view_count") {
      return b.viewCount - a.viewCount;
    }

    return b.publishedAt.localeCompare(a.publishedAt);
  });
}

export function getPolicyBySlug(slug: string) {
  return mockPolicies.find((policy) => policy.slug === slug);
}

export function getPolicyById(id: string) {
  return mockPolicies.find((policy) => policy.id === id);
}

export function getRelatedPolicies(policy: Policy, limit = 3) {
  return mockPolicies
    .filter((item) => item.status === "published" && item.id !== policy.id)
    .map((item) => {
      let score = 0;
      if (item.regionName === policy.regionName) score += 3;
      if (item.category === policy.category) score += 3;
      if (item.publisher === policy.publisher) score += 2;
      if (item.targetGroups.some((group) => policy.targetGroups.includes(group))) score += 1;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.item.publishedAt.localeCompare(a.item.publishedAt))
    .slice(0, limit)
    .map(({ item }) => item);
}

export function getCategoryStats() {
  return mockPolicies
    .filter((policy) => policy.status === "published")
    .reduce<Record<string, number>>((acc, policy) => {
      acc[policy.category] = (acc[policy.category] ?? 0) + 1;
      return acc;
    }, {});
}

export function getRegionStats() {
  return mockPolicies
    .filter((policy) => policy.status === "published")
    .reduce<Record<string, number>>((acc, policy) => {
      acc[policy.regionName] = (acc[policy.regionName] ?? 0) + 1;
      return acc;
    }, {});
}

export function getSearchSuggestions() {
  const terms = new Set<string>();
  mockPolicies.forEach((policy) => {
    terms.add(policy.category);
    terms.add(policy.regionName);
    policy.targetGroups.forEach((group) => terms.add(group));
    normalizeText(policy.titleDe)
      .split(" ")
      .filter((word) => word.length > 4)
      .forEach((word) => terms.add(word));
  });
  return [...terms].slice(0, 12);
}

async function getPolicyByFieldData(
  field: "id" | "slug",
  value: string,
  options?: { includeHidden?: boolean }
) {
  const includeHidden = options?.includeHidden ?? false;
  const supabase = includeHidden ? getSupabaseAdminClient() : getSupabasePublicClient();

  if (!supabase) {
    return null;
  }

  try {
    let query = supabase.from(getPoliciesTable()).select("*").eq(field, value);
    if (!includeHidden) {
      query = query.eq("status", "published");
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      return null;
    }

    return rowToPolicy(data as PolicyRow);
  } catch {
    return null;
  }
}

async function queryPolicies(
  supabase: SupabaseClient,
  filters: PolicyFilters,
  options: { includeHidden: boolean }
): Promise<PolicyListResult> {
  const includeHidden = options.includeHidden;
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const fetchLimit = Math.max(end, 5000);

  let query = supabase.from(getPoliciesTable()).select("*");

  if (!includeHidden) {
    query = query.eq("status", "published");
  } else if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.regionLevel) query = query.eq("region_level", filters.regionLevel);
  if (filters.dateFrom) query = query.gte("published_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("published_at", filters.dateTo);

  if (filters.days) {
    const days = toPositiveInt(filters.days, 0);
    if (days > 0) {
      const boundary = new Date();
      boundary.setDate(boundary.getDate() - days);
      query = query.gte("published_at", boundary.toISOString().slice(0, 10));
    }
  }

  if (filters.sort === "effective_at") {
    query = query.order("effective_at", { ascending: false, nullsFirst: false });
  } else if (filters.sort === "risk_level") {
    query = query.order("risk_level", { ascending: false }).order("published_at", { ascending: false });
  } else if (filters.sort === "view_count") {
    query = query.order("view_count", { ascending: false });
  } else {
    query = query.order("published_at", { ascending: false });
  }

  const { data, error } = await query.range(0, fetchLimit - 1);

  if (error) {
    throw error;
  }

  const filtered = sortPolicies(
    filterPoliciesForDisplay(((data ?? []) as PolicyRow[]).map(rowToPolicy), filters, { includeHidden }),
    filters.sort
  );

  return {
    data: filtered.slice(start, end),
    total: filtered.length,
    page,
    pageSize
  };
}

async function countPolicies(
  supabase: SupabaseClient,
  filters: { status?: PolicyStatus; riskLevel?: RiskLevel } = {}
) {
  let query = supabase.from(getPoliciesTable()).select("*", { count: "exact", head: true });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.riskLevel) query = query.eq("risk_level", filters.riskLevel);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function rowToPolicy(row: PolicyRow): Policy {
  return normalizePolicyForDisplay({
    id: row.id,
    slug: row.slug,
    titleZh: row.title_zh,
    titleDe: row.title_de,
    publisher: row.publisher,
    officialUrl: row.official_url,
    publishedAt: toDateString(row.published_at),
    effectiveAt: row.effective_at ? toDateString(row.effective_at) : undefined,
    regionLevel: row.region_level as Policy["regionLevel"],
    regionName: row.region_name,
    category: row.category,
    targetGroups: row.target_groups ?? [],
    summaryZh: row.summary_zh,
    keyChanges: row.key_changes ?? [],
    userNotes: row.user_notes,
    impactZh: row.impact_zh,
    contentZh: row.content_zh,
    contentDeSummary: row.content_de_summary ?? undefined,
    riskLevel: row.risk_level as Policy["riskLevel"],
    status: row.status as Policy["status"],
    supersededBy: row.superseded_by ?? undefined,
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function filterPoliciesForDisplay(
  policies: Policy[],
  filters: PolicyFilters,
  options: { includeHidden: boolean }
) {
  const includeHidden = options.includeHidden;
  const now = new Date();

  return policies.filter((policy) => {
    if (!includeHidden && policy.status !== "published") {
      return false;
    }

    if (filters.status && filters.status !== "all" && policy.status !== filters.status) {
      return false;
    }

    if (filters.regionLevel && policy.regionLevel !== filters.regionLevel) {
      return false;
    }

    if (filters.regionName && !matchesRegionName(policy, filters.regionName)) {
      return false;
    }

    if (filters.category && policy.category !== filters.category) {
      return false;
    }

    if (filters.targetGroup && !policy.targetGroups.includes(filters.targetGroup)) {
      return false;
    }

    if (filters.days) {
      const days = toPositiveInt(filters.days, 0);
      if (days > 0) {
        const boundary = new Date(now);
        boundary.setDate(boundary.getDate() - days);
        if (new Date(policy.publishedAt) < boundary) {
          return false;
        }
      }
    }

    if (filters.dateFrom && policy.publishedAt < filters.dateFrom) {
      return false;
    }

    if (filters.dateTo && policy.publishedAt > filters.dateTo) {
      return false;
    }

    if (filters.query) {
      const haystack = [
        policy.titleZh,
        policy.titleDe,
        policy.publisher,
        policy.regionName,
        policy.category,
        policy.summaryZh,
        policy.contentZh,
        policy.targetGroups.join(" ")
      ].join(" ");

      return includesText(haystack, filters.query);
    }

    return true;
  });
}

function toDateString(value: string) {
  return value.slice(0, 10);
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", " ");
}

type PolicyRow = {
  id: string;
  slug: string;
  title_zh: string;
  title_de: string;
  publisher: string;
  official_url: string;
  published_at: string;
  effective_at: string | null;
  region_level: string;
  region_name: string;
  category: string;
  target_groups: string[];
  summary_zh: string;
  key_changes: string[];
  user_notes: string;
  impact_zh: string;
  content_zh: string;
  content_de_summary: string | null;
  risk_level: string;
  status: string;
  superseded_by: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
};
