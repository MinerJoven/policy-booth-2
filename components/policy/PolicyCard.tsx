import Link from "next/link";
import { ArrowRight, CalendarDays, ExternalLink, MapPin, Tags } from "lucide-react";
import type { PolicyV2 } from "@/lib/types-v2";
import { cn, formatDate } from "@/lib/utils";

interface PolicyCardProps {
  policy: PolicyV2;
}

export function PolicyCard({ policy }: PolicyCardProps) {
  return (
    <article className="rounded-lg border border-line border-l-4 border-l-policy-blue bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
      <Link href={`/policies/${policy.slug}`} className="focus-ring block rounded-lg">
        <h3 className="text-lg font-semibold leading-7 text-ink">{policy.titleZh}</h3>
        <p className="mt-1 text-sm leading-6 text-neutral-600">{policy.titleDe}</p>
      </Link>

      <p className="mt-4 text-sm leading-6 text-neutral-700 line-clamp-3">{policy.summaryZh}</p>

      <div className="mt-4 grid gap-2 text-sm text-neutral-600 sm:grid-cols-2">
        <span className="inline-flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          {policy.publisher}
        </span>
        <span className="inline-flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {policy.regionLevel} · {policy.regionName}
        </span>
        {policy.lastFetchedAt ? (
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            更新 {formatDate(policy.lastFetchedAt)}
          </span>
        ) : null}
        {policy.tags && policy.tags.length > 0 ? (
          <span className="inline-flex items-center gap-2">
            <Tags className="h-4 w-4" />
            {policy.tags.slice(0, 2).join(" · ")}
            {policy.tags.length > 2 ? ` +${policy.tags.length - 2}` : ""}
          </span>
        ) : null}
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
