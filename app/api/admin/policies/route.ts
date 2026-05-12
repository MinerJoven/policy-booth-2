import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api";
import { getPoliciesTable, getSupabaseAdminClient } from "@/lib/supabase";
import { createSlug } from "@/lib/utils";
import { policyPayloadSchema } from "@/lib/validation";
import type { z } from "zod";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({
      data: [],
      warning: "未配置 Supabase Secret Key，后台列表使用页面内置示例数据。"
    });
  }

  const { data, error } = await supabase
    .from(getPoliciesTable())
    .select("*")
    .order("published_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const payload = await request.json();
  const parsed = policyPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid policy payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const dbPayload = toDbPayload(parsed.data);

  if (!supabase) {
    return NextResponse.json(
      {
        data: {
          id: `mock-${Date.now()}`,
          slug: dbPayload.slug,
          ...parsed.data
        },
        warning: "已完成字段校验。当前未配置 Supabase，内容不会持久化保存。"
      },
      { status: 201 }
    );
  }

  const { data, error } = await supabase
    .from(getPoliciesTable())
    .insert(dbPayload)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

function toDbPayload(payload: z.infer<typeof policyPayloadSchema>) {
  return {
    slug: createSlug(payload.titleDe || payload.titleZh),
    title_zh: payload.titleZh,
    title_de: payload.titleDe,
    publisher: payload.publisher,
    official_url: payload.officialUrl,
    published_at: payload.publishedAt,
    effective_at: payload.effectiveAt || null,
    region_level: payload.regionLevel,
    region_name: payload.regionName,
    category: payload.category,
    target_groups: payload.targetGroups,
    summary_zh: payload.summaryZh,
    key_changes: payload.keyChanges,
    user_notes: payload.userNotes,
    impact_zh: payload.impactZh,
    content_zh: payload.contentZh,
    content_de_summary: payload.contentDeSummary || null,
    risk_level: payload.riskLevel,
    status: payload.status
  };
}
