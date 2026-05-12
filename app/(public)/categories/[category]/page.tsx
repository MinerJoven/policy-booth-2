import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PolicyCard } from "@/components/policy/PolicyCard";
import { CATEGORIES } from "@/lib/constants";
import { listPoliciesData } from "@/lib/data";

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  const decoded = decodeURIComponent(category);
  return {
    title: `${decoded}政策`
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;
  const decoded = decodeURIComponent(category);
  const categoryInfo = CATEGORIES.find((item) => item.value === decoded);

  if (!categoryInfo) {
    notFound();
  }

  const result = await listPoliciesData({ category: decoded, pageSize: 20 });
  const regions = [...new Set(result.data.map((policy) => policy.regionName))];
  const targetGroups = [...new Set(result.data.flatMap((policy) => policy.targetGroups))];

  return (
    <section className="mx-auto max-w-7xl px-5 py-8">
      <div className="border-b border-line pb-6">
        <p className="text-sm font-medium text-policy-green">政策分类</p>
        <p className="mt-2 text-3xl font-semibold text-ink">{categoryInfo.label}</p>
      </div>

      <div className="grid gap-8 py-8 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-6">
          <div className="rounded-lg border border-line bg-white p-4">
            <h2 className="font-semibold text-ink">常见适用人群</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {targetGroups.map((group) => (
                <Link
                  key={group}
                  href={`/policies?category=${encodeURIComponent(decoded)}&target_group=${encodeURIComponent(group)}`}
                  className="rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-policy-green"
                >
                  {group}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4">
            <h2 className="font-semibold text-ink">可筛选地区</h2>
            <div className="mt-3 grid gap-2">
              {regions.map((region) => (
                <Link
                  key={region}
                  href={`/policies?category=${encodeURIComponent(decoded)}&region_name=${encodeURIComponent(region)}`}
                  className="inline-flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2 text-sm text-neutral-700 hover:border-policy-blue"
                >
                  {region}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <div>
          <h2 className="text-xl font-semibold text-ink">该分类下最新政策</h2>
          <div className="mt-5 grid gap-4">
            {result.data.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
