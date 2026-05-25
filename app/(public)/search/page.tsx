import { PolicyCard } from "@/components/policy/PolicyCard";
import { SearchBar } from "@/components/search/SearchBar";
import { listPoliciesData } from "@/lib/data-v2";
import { getSingleParam } from "@/lib/utils";

interface SearchPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const SUGGESTIONS = ["欧盟蓝卡", "工作签证", "留学签证", "入籍", "家庭团聚", "永居", "医疗保险", "住房登记", "驾照", "德语课程"];

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = getSingleParam(resolvedSearchParams?.q);
  const result = query ? await listPoliciesData({ query, pageSize: 20 }) : { data: [], total: 0 };

  return (
    <section className="mx-auto max-w-5xl px-5 py-8">
      <div className="border-b border-line pb-6">
        <h1 className="text-3xl font-semibold text-ink">搜索政策</h1>
        <p className="mt-2 max-w-3xl text-base leading-7 text-neutral-600">
          支持中文和德文关键词，例如蓝卡、Blaue Karte、入籍、Einbürgerung。
        </p>
        <div className="mt-5">
          <SearchBar defaultValue={query ?? ""} />
        </div>
      </div>

      {!query ? (
        <div className="py-8">
          <h2 className="text-lg font-semibold text-ink">可以试试这些关键词</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <a
                key={suggestion}
                href={`/search?q=${encodeURIComponent(suggestion)}`}
                className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-blue hover:text-policy-blue"
              >
                {suggestion}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div className="py-8">
          <p className="text-sm text-neutral-600">
            关键词 <span className="font-semibold text-ink">{query}</span> 找到{" "}
            <span className="font-semibold text-ink">{result.total}</span> 条结果
          </p>
          <div className="mt-5 grid gap-4">
            {result.data.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} />
            ))}
          </div>
          {result.data.length === 0 ? (
            <div className="rounded-lg border border-line bg-white p-8 text-center">
              <h2 className="text-lg font-semibold text-ink">暂无结果</h2>
              <p className="mt-2 text-sm text-neutral-600">可以换一个关键词，或回到政策库使用筛选。</p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
