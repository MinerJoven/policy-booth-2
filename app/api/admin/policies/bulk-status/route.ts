import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api";
import { getPoliciesTable, getSupabaseAdminClient } from "@/lib/supabase";

const allowedStatuses = ["draft", "published", "unpublished", "expired"];

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => null)) as { ids?: unknown[]; status?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.map((id: unknown) => String(id)).filter(Boolean) : [];
  const status = String(body?.status ?? "");

  if (!allowedStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: "No policy ids provided." }, { status: 400 });
  }

  if (ids.length > 500) {
    return NextResponse.json({ error: "Too many policies selected. Please publish in smaller batches." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from(getPoliciesTable())
    .update({ status })
    .in("id", ids)
    .select("id,status");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count: data?.length ?? 0 });
}
