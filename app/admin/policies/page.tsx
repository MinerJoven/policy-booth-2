import Link from "next/link";
import { Edit3, Plus } from "lucide-react";
import { AIReviewBatchButton } from "@/components/admin/AIReviewBatchButton";
import { AIReviewButton } from "@/components/admin/AIReviewButton";
import { BulkPolicyActions } from "@/components/admin/BulkPolicyActions";
import { RiskBadge } from "@/components/policy/RiskBadge";
import { StatusBadge } from "@/components/policy/StatusBadge";
import { STATUS_CONFIG } from "@/lib/constants";
import { requireAdmin } from "@/lib/auth";
import { listPoliciesData, parseFiltersFromSearchParams } from "@/lib/data";
import { getPolicyReviewsTable, getSupabaseAdminClient } from "@/lib/supabase";
import type { PolicyStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface AdminPoliciesPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function AdminPoliciesPage({ searchParams }: AdminPoliciesPageProps) {
  await requireAdmin("/admin/policies");

  const resolvedSearchParams = await searchParams;
  const filters = parseFiltersFromSearchParams(resolvedSearchParams);
  const result = await listPoliciesData({ ...filters, pageSize: 5000 }, { includeHidden: true });
  const visiblePolicies = [...result.data]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 250);
  const latestReviews = await getLatestReviewStatusByPolicy(visiblePolicies.map((policy) => policy.id));
  const formId = "admin-policy-bulk-form";
  const draftPolicyIds = visiblePolicies.filter((policy) => policy.status === "draft").map((policy) => policy.id);

  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">政策内容管理</h2>
          <p className="mt-1 text-sm text-neutral-600">
            支持按状态快速筛选，并进入编辑表单维护结构化字段。当前显示 {visiblePolicies.length} / 共 {result.total} 条，按更新时间倒序。
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-3">
          <AIReviewBatchButton policyIds={visiblePolicies.map((policy) => policy.id)} />
          <Link
            href="/admin/policies/new"
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-policy-blue"
          >
            <Plus className="h-4 w-4" />
            新增政策
          </Link>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <StatusTab label="全部" value="all" active={!filters.status || filters.status === "all"} />
        {(Object.keys(STATUS_CONFIG) as PolicyStatus[]).map((status) => (
          <StatusTab key={status} label={STATUS_CONFIG[status].label} value={status} active={filters.status === status} />
        ))}
      </div>

      <div className="mt-5">
        <BulkPolicyActions formId={formId} draftPolicyIds={draftPolicyIds} />
      </div>

      <div className="mt-5 overflow-x-auto">
        <form id={formId}>
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-neutral-500">
              <th className="w-10 border-b border-line py-3 pr-4 font-medium">选择</th>
              <th className="border-b border-line py-3 pr-4 font-medium">标题</th>
              <th className="border-b border-line px-4 py-3 font-medium">分类</th>
              <th className="border-b border-line px-4 py-3 font-medium">地区</th>
              <th className="border-b border-line px-4 py-3 font-medium">状态</th>
              <th className="border-b border-line px-4 py-3 font-medium">风险</th>
              <th className="border-b border-line px-4 py-3 font-medium">AI复核</th>
              <th className="border-b border-line px-4 py-3 font-medium">发布时间</th>
              <th className="border-b border-line py-3 pl-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {visiblePolicies.map((policy) => (
              <tr key={policy.id} className="align-top">
                <td className="border-b border-line py-4 pr-4">
                  <input
                    type="checkbox"
                    name="policyId"
                    value={policy.id}
                    disabled={policy.status === "published"}
                    aria-label={`选择 ${policy.titleZh}`}
                    className="h-4 w-4 rounded border-line text-policy-blue focus:ring-policy-blue disabled:opacity-40"
                  />
                </td>
                <td className="border-b border-line py-4 pr-4">
                  <p className="font-medium text-ink">{policy.titleZh}</p>
                  <p className="mt-1 text-xs text-neutral-500">{policy.titleDe}</p>
                </td>
                <td className="border-b border-line px-4 py-4 text-neutral-700">{policy.category}</td>
                <td className="border-b border-line px-4 py-4 text-neutral-700">{policy.regionName}</td>
                <td className="border-b border-line px-4 py-4">
                  <StatusBadge status={policy.status} />
                </td>
                <td className="border-b border-line px-4 py-4">
                  <RiskBadge riskLevel={policy.riskLevel} />
                </td>
                <td className="border-b border-line px-4 py-4">
                  <AIReviewButton policyId={policy.id} latestStatus={latestReviews[policy.id]} />
                </td>
                <td className="border-b border-line px-4 py-4 text-neutral-700">{formatDate(policy.publishedAt)}</td>
                <td className="border-b border-line py-4 pl-4">
                  <Link
                    href={`/admin/policies/${policy.id}`}
                    className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-blue hover:text-policy-blue"
                  >
                    <Edit3 className="h-4 w-4" />
                    编辑
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </form>
      </div>
    </section>
  );
}

async function getLatestReviewStatusByPolicy(policyIds: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || policyIds.length === 0) return {};

  const { data, error } = await supabase
    .from(getPolicyReviewsTable())
    .select("policy_id,review_status,reviewed_at")
    .in("policy_id", policyIds)
    .order("reviewed_at", { ascending: false });

  if (error) return {};

  return (data ?? []).reduce<Record<string, string>>((acc, review) => {
    if (review.policy_id && !acc[review.policy_id]) {
      acc[review.policy_id] = review.review_status;
    }
    return acc;
  }, {});
}

function StatusTab({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <Link
      href={value === "all" ? "/admin/policies" : `/admin/policies?status=${value}`}
      className={active
        ? "rounded-lg border border-ink bg-ink px-3 py-2 text-sm font-medium text-white"
        : "rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-blue"
      }
    >
      {label}
    </Link>
  );
}
