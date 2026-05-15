import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense } from "react";
import { listJobsData, parseJobFiltersFromUrl } from "@/lib/data-v2";
import { JobsFilters } from "@/components/jobs/JobsFilters";
import { SITE_NAME } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: `招聘职位 | ${SITE_NAME}`,
  description: "德国联邦劳动局 Jobbörse 最新招聘信息，中文翻译，华人特供标签",
};

interface JobsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseJobFiltersFromUrl(
    new URL("http://localhost?" + new URLSearchParams(
      Object.fromEntries(
        Object.entries(resolvedSearchParams ?? {}).flatMap(([k, v]) =>
          Array.isArray(v) ? v.map(vi => [k, vi]) : [[k, v ?? ""]]
        )
      )
    ).toString(), "http://localhost")
  );
  const result = await listJobsData(filters);

  const { page, pageSize, total } = result;
  const totalPages = Math.ceil(total / pageSize);
  const from = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* Header */}
      <div className="border-b border-line pb-6">
        <h1 className="text-3xl font-semibold text-ink">招聘信息</h1>
        <p className="mt-2 max-w-3xl text-base leading-7 text-neutral-600">
          德国联邦劳动局（BA）Jobbörse 职位库实时同步，带中文翻译和华人特供标签。
        </p>
        <div className="mt-5 max-w-3xl">
          <Suspense fallback={<div className="h-14 animate-pulse rounded-lg bg-neutral-100" />}>
            <JobsFilters />
          </Suspense>
        </div>
      </div>

      {/* Job Count */}
      <p className="mt-6 text-sm text-neutral-600">
        {total > 0
          ? `显示第 ${from}–${to} 条，共 ${total} 个职位`
          : `共找到 ${total} 个职位`}
      </p>

      {/* Job List */}
      <div className="mt-4 grid gap-4">
        {result.data.length > 0 ? (
          result.data.map((job) => <JobCard key={job.refnr} job={job} />)
        ) : (
          <div className="rounded-lg border border-line bg-white p-8 text-center">
            <p className="text-neutral-600">暂无职位</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <PaginationLinks page={page} totalPages={totalPages} resolvedSearchParams={resolvedSearchParams ?? {}} />
      )}

      {/* Sync Footer */}
      <p className="mt-8 text-center text-xs text-neutral-500">
        数据来源：德国联邦劳动局 Jobbörse · 实时同步更新
      </p>
    </div>
  );
}

function JobCard({ job }: { job: Awaited<ReturnType<typeof listJobsData>>["data"][number] }) {
  const isNew = job.publishedAt
    ? (Date.now() - new Date(job.publishedAt).getTime()) < 3 * 24 * 60 * 60 * 1000
    : false;

  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-sm transition hover:shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {/* Title */}
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">
              {job.titleZh ?? job.titleDe}
            </h2>
            {isNew && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                NEW
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-600">{job.titleDe}</p>

          {/* Meta */}
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-neutral-600">
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {job.city}
            </span>
            <span>{job.employer}</span>
            {job.publishedAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDate(job.publishedAt)}
              </span>
            )}
          </div>

          {/* Brief */}
          {job.briefZh && (
            <p className="mt-3 text-sm leading-6 text-neutral-700">{job.briefZh}</p>
          )}

          {/* Tags */}
          <div className="mt-3 flex flex-wrap gap-2">
            {job.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-policy-green"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Action */}
        <Link
          href={`/jobs/${job.refnr}`}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-policy-blue"
        >
          查看详情
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

function buildPageUrl(targetPage: number, resolvedSearchParams: SearchParams | undefined): string {
  const params = new URLSearchParams();
  const entries = Object.entries(resolvedSearchParams ?? {});
  for (const [k, v] of entries) {
    if (k === "page") continue;
    if (Array.isArray(v)) {
      for (const vi of v) params.append(k, vi);
    } else if (v !== undefined) {
      params.set(k, v);
    }
  }
  params.set("page", String(targetPage));
  return `/jobs?${params.toString()}`;
}

function PaginationLinks({
  page,
  totalPages,
  resolvedSearchParams,
}: {
  page: number;
  totalPages: number;
  resolvedSearchParams: SearchParams;
}) {
  const prevUrl = buildPageUrl(page - 1, resolvedSearchParams);
  const nextUrl = buildPageUrl(page + 1, resolvedSearchParams);

  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      {page > 1 ? (
        <Link
          href={prevUrl}
          className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-policy-green hover:text-policy-green"
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </Link>
      ) : (
        <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-400">
          <ChevronLeft className="h-4 w-4" />
          上一页
        </span>
      )}

      <span className="px-3 text-sm text-neutral-600">
        第 {page} / {totalPages} 页
      </span>

      {page < totalPages ? (
        <Link
          href={nextUrl}
          className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-policy-green hover:text-policy-green"
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-400">
          下一页
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}
