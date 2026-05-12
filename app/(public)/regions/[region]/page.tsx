import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { PolicyCard } from "@/components/policy/PolicyCard";
import { listPoliciesData } from "@/lib/data";

interface RegionPageProps {
  params: Promise<{ region: string }>;
}

export async function generateMetadata({ params }: RegionPageProps): Promise<Metadata> {
  const { region } = await params;
  return {
    title: `${decodeURIComponent(region)} 地区政策`
  };
}

export default async function RegionPage({ params }: RegionPageProps) {
  const { region } = await params;
  const decoded = decodeURIComponent(region);
  const result = await listPoliciesData({ regionName: decoded, pageSize: 20 });
  const categories = [...new Set(result.data.map((policy) => policy.category))];
  const publishers = [...new Set(result.data.map((policy) => policy.publisher))];
  const regionLevel = result.data[0]?.regionLevel ?? "地区";

  return (
    <section className="mx-auto max-w-7xl px-5 py-8">
      <div className="border-b border-line pb-6">
        <p className="text-sm font-medium text-policy-blue">地区政策</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">{decoded}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-neutral-600">
          地区层级：{regionLevel}。这里集中展示该地区相关政策、常见主题和官方来源入口。
        </p>
      </div>

      <div className="grid gap-8 py-8 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-6">
          <div className="rounded-lg border border-line bg-white p-4">
            <h2 className="font-semibold text-ink">常见政策主题</h2>
            <div className="mt-3 grid gap-2">
              {categories.map((category) => (
                <Link
                  key={category}
                  href={`/policies?region_name=${encodeURIComponent(decoded)}&category=${encodeURIComponent(category)}`}
                  className="inline-flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2 text-sm text-neutral-700 hover:border-policy-green"
                >
                  {category}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-4">
            <h2 className="font-semibold text-ink">官方来源列表</h2>
            <div className="mt-3 grid gap-2">
              {publishers.map((publisher) => (
                <span key={publisher} className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-neutral-700">
                  <ExternalLink className="h-4 w-4" />
                  {publisher}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <div>
          <h2 className="text-xl font-semibold text-ink">该地区最新政策</h2>
          {result.data.length > 0 ? (
            <div className="mt-5 grid gap-4">
              {result.data.map((policy) => (
                <PolicyCard key={policy.id} policy={policy} />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-line bg-white p-8 text-center">
              <h2 className="text-lg font-semibold text-ink">暂无该地区内容</h2>
              <p className="mt-2 text-sm text-neutral-600">后续接入 Supabase 后可由运营持续补充。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
