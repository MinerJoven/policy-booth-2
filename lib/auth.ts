import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { getSupabasePublishableKey, getSupabaseUrl, hasSupabaseAuthEnv } from "@/lib/supabase-config";

export const ADMIN_EMAIL = "joventien001@outlook.com";
export const ADMIN_EMAIL_ALIASES = ["joventien001@gmail.com"];

export function hasSupabaseAuthConfig() {
  return hasSupabaseAuthEnv();
}

export async function createSupabaseServerClient() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();

  if (!url || !key) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can read cookies but cannot always write them.
        }
      }
    }
  });
}

export function getAdminEmails() {
  return Array.from(
    new Set(
      [ADMIN_EMAIL, ...ADMIN_EMAIL_ALIASES, ...(process.env.ADMIN_EMAILS ?? "").split(",")]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function isAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return getAdminEmails().includes(email.toLowerCase());
}

export async function hasAdminAccess(email?: string | null) {
  if (!email) {
    return false;
  }

  return isAdminEmail(email);
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
}

export async function getAdminUser() {
  const user = await getCurrentUser();
  return (await hasAdminAccess(user?.email)) ? user : null;
}

export async function requireAdmin(path = "/admin") {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect(`/admin/login?next=${encodeURIComponent(path)}`);
  }

  return adminUser;
}
