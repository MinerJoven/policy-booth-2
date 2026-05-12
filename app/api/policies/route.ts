import { NextRequest, NextResponse } from "next/server";
import { listPoliciesData, parseFiltersFromUrl } from "@/lib/data";
import { createSlug } from "@/lib/utils";
import { policyPayloadSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const filters = parseFiltersFromUrl(new URL(request.url));
  const result = await listPoliciesData(filters);

  return NextResponse.json({
    data: result.data,
    total: result.total,
    page: result.page,
    page_size: result.pageSize
  });
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const parsed = policyPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid policy payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(
    {
      data: {
        id: `mock-${Date.now()}`,
        slug: createSlug(parsed.data.titleDe || parsed.data.titleZh),
        ...parsed.data
      },
      warning: "当前未配置持久化数据库，POST 仅完成字段校验并返回演示数据。"
    },
    { status: 201 }
  );
}
