import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin, Building2, ExternalLink } from "lucide-react";
import { getJobByRefnrData } from "@/lib/data-v2";
import { SITE_NAME } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const revalidate = 3600;

interface JobDetailPageProps {
  params: Promise<{ refnr: string }>;
}

export async function generateMetadata({ params }: JobDetailPageProps): Promise<Metadata> {
  const { refnr } = await params;
  const job = await getJobByRefnrData(refnr);
  if (!job) return { title: "职位未找到" };
  return {
    title: job.titleZh ?? job.titleDe,
    description: job.briefZh ?? `${job.titleZh ?? job.titleDe} — ${job.employer}`,
  };
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { refnr } = await params;
  const job = await getJobByRefnrData(refnr);

  if (!job) notFound();

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-neutral-500">
        ← <a href="/jobs" className="hover:text-policy-blue">返回招聘列表</a>
      </div>

      {/* Header */}
      <div className="rounded-lg border border-line bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              {job.titleZh ?? job.titleDe}
            </h1>
            <p className="mt-1 text-neutral-600">{job.titleDe}</p>
          </div>
          {job.tags.includes("需要中文") && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              需要中文
            </span>
          )}
        </div>

        {/* Meta Grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-neutral-500" />
            <span className="text-neutral-700">{job.employer}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-neutral-500" />
            <span className="text-neutral-700">{job.city}</span>
          </div>
          {job.publishedAt && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-500">发布时间</span>
              <span className="text-neutral-700">{formatDate(job.publishedAt)}</span>
            </div>
          )}
          {job.isLimited && (
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">固定期限合同</span>
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="mt-4 flex flex-wrap gap-2">
          {job.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-policy-green bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
            >
              {tag}
            </span>
          ))}
          {job.workType.map((wt) => (
            <span key={wt} className="rounded-full bg-paper px-3 py-1 text-xs text-neutral-600">
              {wt}
            </span>
          ))}
        </div>

        {/* Brief */}
        {job.briefZh && (
          <div className="mt-6 border-t border-line pt-4">
            <h2 className="text-sm font-semibold text-ink">职位简介</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-700">{job.briefZh}</p>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="mt-6">
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-6 py-3 text-sm font-semibold text-white hover:bg-policy-blue"
        >
          在劳动局官网投递
          <ExternalLink className="h-4 w-4" />
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      {/* Disclaimer */}
      <p className="mt-8 text-xs text-neutral-400">
        {SITE_NAME} 仅为招聘信息的中文翻译平台，不对招聘结果负责。具体申请条件请以官方信息为准。
      </p>
    </div>
  );
}
