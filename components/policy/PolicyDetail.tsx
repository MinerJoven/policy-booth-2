import { CalendarDays, ExternalLink, FileText, Landmark, MapPin } from "lucide-react";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { RiskBadge } from "@/components/policy/RiskBadge";
import { StatusBadge } from "@/components/policy/StatusBadge";
import { TargetGroupTags } from "@/components/policy/TargetGroupTags";
import { LEGAL_DISCLAIMER } from "@/lib/constants";
import type { Policy } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface PolicyDetailProps {
  policy: Policy;
  supersededByPolicy?: Policy;
}

export function PolicyDetail({ policy, supersededByPolicy }: PolicyDetailProps) {
  const paragraphs = policy.contentZh.split(/\n+/).filter(Boolean);

  return (
    <article className="mx-auto max-w-5xl px-5 py-8">
      <div className="space-y-4">
        {policy.riskLevel === "high" ? (
          <DisclaimerBanner tone="danger">
            该内容涉及居留、签证、入籍、税务、社保或类似重要事项时，仅可作为官方公开信息的中文辅助理解，不构成个案建议。
          </DisclaimerBanner>
        ) : null}

        {policy.status === "expired" || supersededByPolicy ? (
          <DisclaimerBanner tone="warning">
            该政策已被标记为过期或可能已有新版，请优先查看最新官方来源
            {supersededByPolicy ? `：${supersededByPolicy.titleZh}` : "。"}
          </DisclaimerBanner>
        ) : null}
      </div>

      <header className="mt-8 border-b border-line pb-8">
        <div className="flex flex-wrap gap-2">
          <RiskBadge riskLevel={policy.riskLevel} />
          <StatusBadge status={policy.status} />
        </div>
        <h1 className="mt-5 text-3xl font-semibold leading-tight text-ink md:text-4xl">{policy.titleZh}</h1>
        <p className="mt-3 text-base leading-7 text-neutral-600">{policy.titleDe}</p>
      </header>

      <section className="grid gap-4 border-b border-line py-6 md:grid-cols-2">
        <InfoItem icon={<Landmark className="h-4 w-4" />} label="发布机构" value={policy.publisher} />
        <InfoItem icon={<ExternalLink className="h-4 w-4" />} label="官方来源" value={policy.officialUrl} href={policy.officialUrl} />
        <InfoItem icon={<CalendarDays className="h-4 w-4" />} label="发布时间" value={formatDate(policy.publishedAt)} />
        <InfoItem icon={<CalendarDays className="h-4 w-4" />} label="生效时间" value={formatDate(policy.effectiveAt)} />
        <InfoItem icon={<MapPin className="h-4 w-4" />} label="地区层级" value={`${policy.regionLevel} · ${policy.regionName}`} />
        <InfoItem icon={<FileText className="h-4 w-4" />} label="政策类别" value={policy.category} />
      </section>

      <div className="space-y-10 py-8">
        <section>
          <h2 className="text-xl font-semibold text-ink">一句话总结</h2>
          <p className="mt-3 rounded-lg border border-line bg-white p-4 text-base leading-8 text-neutral-800">
            {policy.summaryZh}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">这条政策影响谁</h2>
          <div className="mt-3">
            <TargetGroupTags targetGroups={policy.targetGroups} />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">关键变化</h2>
          <ul className="mt-3 space-y-3">
            {policy.keyChanges.map((change) => (
              <li key={change} className="rounded-lg border border-line bg-white px-4 py-3 text-sm leading-6 text-neutral-800">
                {change}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">对华人用户的影响</h2>
          <p className="mt-3 text-base leading-8 text-neutral-700">{policy.impactZh}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">你可能需要注意什么</h2>
          <p className="mt-3 text-base leading-8 text-neutral-700">{policy.userNotes}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">中文整理正文</h2>
          <div className="content-flow mt-3 text-base text-neutral-700">
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        {policy.contentDeSummary ? (
          <details className="rounded-lg border border-line bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">德文原文摘要</summary>
            <p className="mt-3 text-sm leading-7 text-neutral-700">{policy.contentDeSummary}</p>
          </details>
        ) : null}

        <section className="rounded-lg border border-line bg-white p-5">
          <h2 className="text-xl font-semibold text-ink">官方来源</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            发布机构：{policy.publisher} · 发布时间：{formatDate(policy.publishedAt)}
          </p>
          <a
            className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-policy-blue"
            href={policy.officialUrl}
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
