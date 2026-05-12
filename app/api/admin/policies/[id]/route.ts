import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api";
import { getPoliciesTable, getSupabaseAdminClient } from "@/lib/supabase";
import { policyPayloadSchema } from "@/lib/validation";

interface AdminPolicyRouteProps {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: AdminPolicyRouteProps) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const payload = await request.json();
  const parsed = policyPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid policy payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({
      data: { id, ...parsed.data },
      warning: "已完成字段校验。当前未配置 Supabase，编辑不会持久化保存。"
    });
  }

  const { data, error } = await supabase
    .from(getPoliciesTable())
    .update({
      title_zh: parsed.data.titleZh,
      title_de: parsed.data.titleDe,
      publisher: parsed.data.publisher,
      official_url: parsed.data.officialUrl,
      published_at: parsed.data.publishedAt,
      effective_at: parsed.data.effectiveAt || null,
      region_level: parsed.data.regionLevel,
      region_name: parsed.data.regionName,
      category: parsed.data.category,
      target_groups: parsed.data.targetGroups,
      summary_zh: parsed.data.summaryZh,
      key_changes: parsed.data.keyChanges,
      user_notes: parsed.data.userNotes,
      impact_zh: parsed.data.impactZh,
      content_zh: parsed.data.contentZh,
      content_de_summary: parsed.data.contentDeSummary || null,
      risk_level: parsed.data.riskLevel,
      status: parsed.data.status
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: AdminPolicyRouteProps) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({
      data: { id },
      warning: "当前未配置 Supabase，删除操作仅返回演示响应。"
    });
  }

  const { error } = await supabase.from(getPoliciesTable()).delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id } });
}
