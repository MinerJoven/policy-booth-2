import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, hasAdminAccess } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "missing_config" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const accessToken = String(body?.access_token ?? "");
  const refreshToken = String(body?.refresh_token ?? "");
  const next = safeNextPath(String(body?.next ?? "/admin"));

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "missing_session" }, { status: 400 });
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  if (error || !data.user) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }

  if (!(await hasAdminAccess(data.user.email))) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

  return NextResponse.json({ redirectTo: next });
}

function safeNextPath(value: string) {
  if (!value.startsWith("/admin") || value.startsWith("/admin/login")) {
    return "/admin";
  }

  return value;
}
