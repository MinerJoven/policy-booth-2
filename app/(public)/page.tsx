import Link from "next/link";
import { ArrowRight, Database, MapPinned, Tags, Users } from "lucide-react";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { PolicyCard } from "@/components/policy/PolicyCard";
import { SearchBar } from "@/components/search/SearchBar";
import { CATEGORIES, SITE_DESCRIPTION, SITE_NAME, TARGET_GROUPS } from "@/lib/constants";
import { listPoliciesData } from "@/lib/data-v2";
import { encodeSegment } from "@/lib/utils";

export default async function HomePage() {
  const [latestResult] = await Promise.all([
    listPoliciesData({ pageSize: 5 }),
  ]);
  const latestPolicies = latestResult.data;

  return (
    <>
      <section className="border-b border-line bg-paper">
        <div className="mx-auto max-w-7xl px-5 py-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm">
              <Database className="h-4 w-4 text-policy-green" />
              当前数据源：最新官方办事指南
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-tight text-ink md:text-5xl">{SITE_NAME}</h1>
            <p className="mt-4 max-w-2xl text-xl leading-8 text-neutral-700">{SITE_DESCRIPTION}</p>
            <p className="mt-3 max-w-2xl text-base leading-8 text-neutral-600">
              为在德华人整理官方办事指南——涵盖签证、工作、留学、生活等领域的实用信息。
            </p>
            <div className="mt-6 max-w-3xl">
              <SearchBar />
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <Tags className="h-5 w-5" />
              按主题进入
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <Link
                  key={category.value}
                  href={`/policies?category=${encodeURIComponent(category.value)}`}
                  className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-policy-green hover:bg-white hover:text-policy-green"
                >
                  {category.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <Users className="h-5 w-5" />
              按身份筛选
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {TARGET_GROUPS.map((group) => (
                <Link
                  key={group}
                  href={`/policies?tag=${encodeURIComponent(group)}`}
                  className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-policy-green hover:bg-white hover:text-policy-green"
                >
                  {group}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <DisclaimerBanner />
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-10">
        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-ink">最新办事指南</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">最近更新和添加的政策办事指南。</p>
            </div>
            <Link
              href="/policies"
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-policy-blue"
            >
              政策库
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-5 grid gap-4">
            {latestPolicies.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
