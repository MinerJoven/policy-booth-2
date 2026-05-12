import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FilterPanel } from "@/components/filter/FilterPanel";
import { PolicyCard } from "@/components/policy/PolicyCard";
import { SearchBar } from "@/components/search/SearchBar";
import { parseFiltersFromSearchParams, listPoliciesData } from "@/lib/data";

interface PoliciesPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PoliciesPage({ searchParams }: PoliciesPageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseFiltersFromSearchParams(resolvedSearchParams);
  const result = await listPoliciesData(filters);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <section className="mx-auto max-w-7xl px-5 py-8">
      <div className="border-b border-line pb-6">
        <h1 className="text-3xl font-semibold text-ink">政策库</h1>
        <p className="mt-2 max-w-3xl text-base leading-7 text-neutral-600">
          按地区、主题、适用人群和发布时间筛选德国官方政策中文整理内容。
        </p>
        <div className="mt-5 max-w-3xl">
          <SearchBar compact defaultValue={filters.query ?? ""} />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
        <FilterPanel />

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              共找到 <span className="font-semibold text-ink">{result.total}</span> 条政策
            </p>
            <p className="text-sm text-neutral-600">
              第 {result.page} / {totalPages} 页
            </p>
          </div>

          {result.data.length > 0 ? (
            <div className="grid gap-4">
              {result.data.map((policy) => (
                <PolicyCard key={policy.id} policy={policy} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-white p-8 text-center">
              <h2 className="text-lg font-semibold text-ink">没有匹配的政策</h2>
              <p className="mt-2 text-sm text-neutral-600">可以清空筛选条件，或尝试更宽泛的关键词。</p>
            </div>
          )}

          <Pagination currentPage={result.page} totalPages={totalPages} searchParams={resolvedSearchParams ?? {}} />
        </div>
      </div>
    </section>
  );
}

function Pagination({
  currentPage,
  totalPages,
  searchParams
}: {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-6 flex items-center justify-end gap-2">
      <PageLink page={currentPage - 1} disabled={currentPage <= 1} searchParams={searchParams}>
        <ChevronLeft className="h-4 w-4" />
        上一页
      </PageLink>
      <PageLink page={currentPage + 1} disabled={currentPage >= totalPages} searchParams={searchParams}>
        下一页
        <ChevronRight className="h-4 w-4" />
      </PageLink>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  searchParams,
  children
}: {
  page: number;
  disabled: boolean;
  searchParams: Record<string, string | string[] | undefined>;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value) {
      params.set(key, value);
    }
  });
  params.set("page", String(page));

  if (disabled) {
    return (
      <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-line bg-neutral-100 px-3 py-2 text-sm text-neutral-400">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={`/policies?${params.toString()}`}
      className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-blue hover:text-policy-blue"
    >
      {children}
    </Link>
  );
}
