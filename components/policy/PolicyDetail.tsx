import { CalendarDays, ExternalLink, FileText, Landmark, MapPin, CheckSquare, Clock, DollarSign, ListChecks, Tags } from "lucide-react";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { LEGAL_DISCLAIMER } from "@/lib/constants";
import type { PolicyV2 } from "@/lib/types-v2";
import { formatDate } from "@/lib/utils";

interface PolicyDetailProps {
  policy: PolicyV2;
}

export function PolicyDetail({ policy }: PolicyDetailProps) {
  const hasGuide = policy.requirementsZh?.length > 0 || policy.feesZh || policy.durationZh || policy.stepsZh?.length > 0;

  return (
    <article className="mx-auto max-w-5xl px-5 py-8">
      <header className="border-b border-line pb-8">
        <h1 className="text-3xl font-semibold leading-tight text-ink md:text-4xl">{policy.titleZh}</h1>
        <p className="mt-3 text-base leading-7 text-neutral-600">{policy.titleDe}</p>
      </header>

      <section className="grid gap-4 border-b border-line py-6 md:grid-cols-2">
        <InfoItem icon={<Landmark className="h-4 w-4" />} label="发布机构" value={policy.publisher} />
        <InfoItem icon={<ExternalLink className="h-4 w-4" />} label="来源" value={policy.sourceName} href={policy.sourceUrl} />
        {policy.lastFetchedAt ? (
          <InfoItem icon={<CalendarDays className="h-4 w-4" />} label="更新日期" value={formatDate(policy.lastFetchedAt)} />
        ) : null}
        <InfoItem icon={<MapPin className="h-4 w-4" />} label="地区" value={`${policy.regionLevel} · ${policy.regionName}`} />
        <InfoItem icon={<FileText className="h-4 w-4" />} label="类别" value={policy.category} />
        {policy.tags?.length > 0 && (
          <div className="rounded-lg border border-line bg-white p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-neutral-500">
              <Tags className="h-4 w-4" />
              标签
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {policy.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-paper px-2 py-0.5 text-xs font-medium text-neutral-700">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="space-y-10 py-8">
        {/* 办事指南区块（v2 核心功能） */}
        {hasGuide && (
          <section className="rounded-xl border border-policy-blue/20 bg-blue-50/50 p-6">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <ListChecks className="h-5 w-5 text-policy-blue" />
              办事指南
            </h2>
            <p className="mt-2 text-sm text-neutral-600">以下信息由 AI 根据官方原文整理，仅供参考。请以官方最新信息为准。</p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {policy.requirementsZh?.length > 0 && (
                <div className="md:col-span-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <CheckSquare className="h-4 w-4 text-policy-green" />
                    所需材料
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {policy.requirementsZh.map((req, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg border border-line bg-white px-4 py-3 text-sm leading-6 text-neutral-700">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-policy-green/10 text-xs font-bold text-policy-green">
                          {i + 1}
                        </span>
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {policy.feesZh && (
                <div className="rounded-lg border border-line bg-white p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <DollarSign className="h-4 w-4 text-amber-500" />
                    费用
                  </h3>
                  <p className="mt-2 text-base font-medium text-ink">{policy.feesZh}</p>
                </div>
              )}

              {policy.durationZh && (
                <div className="rounded-lg border border-line bg-white p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Clock className="h-4 w-4 text-policy-blue" />
                    办理时限
                  </h3>
                  <p className="mt-2 text-base font-medium text-ink">{policy.durationZh}</p>
                </div>
              )}
            </div>

            {policy.stepsZh?.length > 0 && (
              <div className="mt-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <ListChecks className="h-4 w-4 text-policy-blue" />
                  办理步骤
                </h3>
                <ol className="mt-3 space-y-3">
                  {policy.stepsZh.map((step, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm leading-6 text-neutral-700">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-policy-blue text-xs font-bold text-white">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}

        {/* 摘要 */}
        <section>
          <h2 className="text-xl font-semibold text-ink">政策摘要</h2>
          <p className="mt-3 rounded-lg border border-line bg-white p-4 text-base leading-8 text-neutral-800">
            {policy.summaryZh}
          </p>
        </section>

        {/* 来源链接 */}
        <section className="rounded-lg border border-line bg-white p-5">
          <h2 className="text-xl font-semibold text-ink">官方来源</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            发布机构：{policy.publisher} · 来源网站：{policy.sourceName}
          </p>
          <a
            className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-policy-blue"
            href={policy.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            打开官方原文
            <ExternalLink className="h-4 w-4" />
          </a>
        </section>

        <DisclaimerBanner>{LEGAL_DISCLAIMER}</DisclaimerBanner>
      </div>
    </article>
  );
}

function InfoItem({
  icon,
  label,
  value,
  href
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-neutral-500">
        {icon}
        {label}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-words text-sm font-medium leading-6 text-policy-blue hover:underline"
        >
          {value}
        </a>
      ) : (
        <p className="mt-2 text-sm font-medium leading-6 text-ink">{value}</p>
      )}
    </div>
  );
}
