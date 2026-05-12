import Link from "next/link";
import { ArrowRight, CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { RISK_CONFIG } from "@/lib/constants";
import type { Policy } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { RiskBadge } from "@/components/policy/RiskBadge";
import { StatusBadge } from "@/components/policy/StatusBadge";
import { TargetGroupTags } from "@/components/policy/TargetGroupTags";

interface PolicyCardProps {
  policy: Policy;
  showStatus?: boolean;
}

export function PolicyCard({ policy, showStatus = false }: PolicyCardProps) {
  return (
    <article
      className={cn(
        "rounded-lg border border-line border-l-4 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft",
        RISK_CONFIG[policy.riskLevel].border
      )}
    >
      <div className="flex flex-wrap gap-2">
        <RiskBadge riskLevel={policy.riskLevel} />
        {showStatus ? <StatusBadge status={policy.status} /> : null}
      </div>

      <Link href={`/policies/${policy.slug}`} className="focus-ring mt-4 block rounded-lg">
        <h3 className="text-lg font-semibold leading-7 text-ink">{policy.titleZh}</h3>
        <p className="mt-1 text-sm leading-6 text-neutral-600">{policy.titleDe}</p>
      </Link>

      <p className="mt-4 text-sm leading-6 text-neutral-700">{policy.summaryZh}</p>

      <div className="mt-4 grid gap-2 text-sm text-neutral-600 sm:grid-cols-2">
        <span className="inline-flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          {policy.publisher}
        </span>
        <span className="inline-flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {policy.regionLevel} · {policy.regionName}
        </span>
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          发布 {formatDate(policy.publishedAt)}
        </span>
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          生效 {formatDate(policy.effectiveAt)}
        </span>
      </div>

      <div className="mt-4">
        <TargetGroupTags targetGroups={policy.targetGroups} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="rounded-md bg-paper px-2.5 py-1 text-xs font-medium text-neutral-700">
          {policy.category}
        </span>
        <Link
          href={`/policies/${policy.slug}`}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition hover:bg-policy-blue"
        >
          查看详情
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
