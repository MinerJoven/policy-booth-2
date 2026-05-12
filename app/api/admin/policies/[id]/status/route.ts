import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api";
import { getPoliciesTable, getSupabaseAdminClient } from "@/lib/supabase";

interface AdminStatusRouteProps {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: AdminStatusRouteProps) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json();
  const status = body.status;

  if (!["draft", "published", "unpublished", "expired"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({
      data: { id, status },
      warning: "当前未配置 Supabase，状态更新仅返回演示响应。"
    });
  }

  const { data, error } = await supabase
    .from(getPoliciesTable())
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
