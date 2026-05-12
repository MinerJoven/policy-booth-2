import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, hasAdminAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next") ?? "/admin");
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(new URL(`/admin/login?error=missing_config&next=${encodeURIComponent(next)}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/admin/login?error=invalid_magic_link&next=${encodeURIComponent(next)}`, request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL(`/admin/login?error=invalid_magic_link&next=${encodeURIComponent(next)}`, request.url));
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!(await hasAdminAccess(user?.email))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(`/admin/login?error=not_admin&next=${encodeURIComponent(next)}`, request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}

function safeNextPath(value: string) {
  if (!value.startsWith("/admin") || value.startsWith("/admin/login")) {
    return "/admin";
  }

  return value;
}
