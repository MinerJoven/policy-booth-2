import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, hasAdminAccess } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = String(formData.get("action") ?? "login");
  const next = safeNextPath(String(formData.get("next") ?? "/admin"));
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(new URL(`/admin/login?error=missing_config&next=${encodeURIComponent(next)}`, request.url), {
      status: 303
    });
  }

  if (action === "logout") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/admin/login?error=signed_out", request.url), { status: 303 });
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return NextResponse.redirect(new URL(`/admin/login?error=missing_credentials&next=${encodeURIComponent(next)}`, request.url), {
      status: 303
    });
  }

  if (!(await hasAdminAccess(email))) {
    return NextResponse.redirect(new URL(`/admin/login?error=not_admin&next=${encodeURIComponent(next)}`, request.url), {
      status: 303
    });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return NextResponse.redirect(new URL(`/admin/login?error=password_failed&next=${encodeURIComponent(next)}`, request.url), {
      status: 303
    });
  }

  if (!(await hasAdminAccess(data.user.email))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(`/admin/login?error=not_admin&next=${encodeURIComponent(next)}`, request.url), {
      status: 303
    });
  }

  return NextResponse.redirect(new URL(next, request.url), { status: 303 });
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  return NextResponse.json({ data: { signedOut: true } });
}

function safeNextPath(value: string) {
  if (!value.startsWith("/admin") || value.startsWith("/admin/login")) {
    return "/admin";
  }

  return value;
}
