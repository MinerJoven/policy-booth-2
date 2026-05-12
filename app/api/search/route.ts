import { NextRequest, NextResponse } from "next/server";
import { listPoliciesData, parseFiltersFromUrl } from "@/lib/data";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const filters = parseFiltersFromUrl(url);

  if (!filters.query) {
    return NextResponse.json({ data: [], total: 0, query: "" });
  }

  const result = await listPoliciesData(filters);

  return NextResponse.json({
    data: result.data.map((policy) => ({
      id: policy.id,
      slug: policy.slug,
      titleZh: policy.titleZh,
      summaryZh: policy.summaryZh,
      regionName: policy.regionName,
      publishedAt: policy.publishedAt,
      category: policy.category,
      targetGroups: policy.targetGroups,
      officialUrl: policy.officialUrl,
      riskLevel: policy.riskLevel
    })),
    total: result.total,
    query: filters.query
  });
}
