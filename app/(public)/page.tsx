import Link from "next/link";
import { ArrowRight, ChevronDown, Database, MapPinned, Tags, Users } from "lucide-react";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { PolicyCard } from "@/components/policy/PolicyCard";
import { SearchBar } from "@/components/search/SearchBar";
import { CATEGORIES, SITE_DESCRIPTION, SITE_NAME, TARGET_GROUPS } from "@/lib/constants";
import {
  getCategoryStatsData,
  getDataSourceLabel,
  getRegionGroupsData,
  getTargetGroupStatsData,
  listPoliciesData
} from "@/lib/data";
import { encodeSegment } from "@/lib/utils";

export default async function HomePage() {
  const [latestResult, focusResult, categoryStats, targetGroupStats, regionGroups] = await Promise.all([
    listPoliciesData({ pageSize: 5 }),
    listPoliciesData({ sort: "risk_level", pageSize: 2 }),
    getCategoryStatsData(),
    getTargetGroupStatsData(),
    getRegionGroupsData()
  ]);
  const latestPolicies = latestResult.data;
  const focusPolicies = focusResult.data;
  const activeCategories = CATEGORIES.filter((category) => (categoryStats[category.value] ?? 0) > 0);
  const orderedCategories = [...(activeCategories.length > 0 ? activeCategories : CATEGORIES)].sort(
    (a, b) => (categoryStats[b.value] ?? 0) - (categoryStats[a.value] ?? 0)
  );
  const activeTargetGroups = TARGET_GROUPS.filter((group) => (targetGroupStats[group] ?? 0) > 0);
  const orderedTargetGroups = activeTargetGroups.length > 0 ? activeTargetGroups : TARGET_GROUPS;

  return (
    <>
      <section className="border-b border-line bg-paper">
        <div className="mx-auto max-w-7xl px-5 py-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm">
              <Database className="h-4 w-4 text-policy-green" />
              当前数据源：{getDataSourceLabel()}
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-tight text-ink md:text-5xl">{SITE_NAME}</h1>
            <p className="mt-4 max-w-2xl text-xl leading-8 text-neutral-700">{SITE_DESCRIPTION}</p>
            <p className="mt-3 max-w-2xl text-base leading-8 text-neutral-600">
              帮你用中文看懂德国联邦、州、市县发布的重要政策变化，并保留官方来源、适用范围和风险提示。
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
              {orderedCategories.map((category) => (
                <Link
                  key={category.value}
                  href={`/categories/${encodeSegment(category.value)}`}
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
              {orderedTargetGroups.map((group) => (
                <Link
                  key={group}
                  href={`/policies?target_group=${encodeURIComponent(group)}`}
                  className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-policy-green hover:bg-white hover:text-policy-green"
                >
                  {group}
                </Link>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <MapPinned className="h-5 w-5" />
              按地区查看
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {regionGroups.map((group) => (
                <div key={group.state} className="flex items-center gap-2">
                  <Link
                    href={`/regions/${encodeSegment(group.state)}`}
                    className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 transition hover:border-policy-blue hover:bg-white hover:text-policy-blue"
                  >
                    {group.state}
                  </Link>
                  {group.cities.length > 0 ? (
                    <details className="group relative">
                      <summary className="focus-ring flex cursor-pointer list-none items-center gap-1 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-policy-blue hover:text-policy-blue">
                        地区
                        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                      </summary>
                      <div className="absolute left-0 z-20 mt-2 min-w-56 rounded-lg border border-line bg-white p-2 shadow-lg">
                        {group.cities.map((city) => (
                          <Link
                            key={city}
                            href={`/regions/${encodeSegment(city)}`}
                            className="focus-ring block rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-paper hover:text-policy-blue"
                          >
                            {city}
                          </Link>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <DisclaimerBanner />
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-ink">本周重点</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">按风险等级和近期发布时间挑出需要优先核验的内容。</p>
            </div>
            <Link
              href="/policies?sort=risk_level"
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-blue hover:text-policy-blue"
            >
              查看更多
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-5 grid gap-4">
            {focusPolicies.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-ink">最新政策</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">优先展示最近发布的官方信息整理。</p>
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
