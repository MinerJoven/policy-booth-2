import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { SITE_NAME } from "@/lib/constants";

const sections = [
  {
    title: "本站宗旨",
    body: "帮助在德国生活、学习和工作的华人更快理解德国官方公开政策信息，并能回到官方来源核验。"
  },
  {
    title: "信息来源说明",
    body: "内容应优先来自联邦政府、州政府、城市官网、Landkreis 官网、外管局、Jobcenter、大学、税务机构等官方公开来源。"
  },
  {
    title: "内容整理流程",
    body: "每条政策都应保留中文标题、德文原始标题、发布机构、官方链接、发布时间、生效时间、适用地区、适用人群、关键变化和风险提示。"
  },
  {
    title: "法律免责声明",
    body: "本站内容不构成法律、税务、移民或其他专业建议，也不承诺某项政策一定适用于某个用户。"
  },
  {
    title: "联系方式",
    body: "联系方式字段后续由运营维护；当前演示版本暂未接入邮件或工单系统。"
  }
];

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-8">
      <div className="border-b border-line pb-6">
        <p className="text-sm font-medium text-policy-green">来源说明</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">关于 {SITE_NAME}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-neutral-600">
          这里说明平台的信息来源、整理方式和法律风险边界。
        </p>
      </div>

      <div className="py-8">
        <DisclaimerBanner />
      </div>

      <div className="grid gap-4">
        {sections.map((section) => (
          <section key={section.title} className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-lg font-semibold text-ink">{section.title}</h2>
            <p className="mt-3 text-base leading-8 text-neutral-700">{section.body}</p>
          </section>
        ))}
      </div>
    </section>
  );
}
