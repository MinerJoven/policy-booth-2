import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { SessionHashBridge } from "@/components/admin/SessionHashBridge";
import { getAdminEmails, getAdminUser, hasSupabaseAuthConfig } from "@/lib/auth";

interface AdminLoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  missing_config: "尚未配置 Liuzi Supabase 登录环境变量。",
  missing_credentials: "请输入邮箱和密码。",
  password_failed: "登录失败，请检查邮箱和密码。",
  email_failed: "登录邮件发送失败，请改用邮箱和密码登录。",
  invalid_magic_link: "登录链接无效或已过期，请重新发送。",
  not_admin: "该邮箱不是德区政策展台管理员。",
  signed_out: "已退出登录。"
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const adminUser = await getAdminUser();
  const resolvedSearchParams = await searchParams;
  const next = getParam(resolvedSearchParams?.next) ?? "/admin";
  const error = getParam(resolvedSearchParams?.error);
  const adminEmails = getAdminEmails();

  if (adminUser) {
    redirect(safeNextPath(next));
  }

  return (
    <section className="mx-auto max-w-md rounded-lg border border-line bg-white p-6 shadow-sm">
      <SessionHashBridge next={safeNextPath(next)} />
      <h2 className="text-xl font-semibold text-ink">后台登录</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600">
        使用 Liuzi 共用 Supabase 账号登录。管理员邮箱为 {adminEmails.map((email) => `\`${email}\``).join(" / ")}，请使用和主页一致的密码。
      </p>
      {!hasSupabaseAuthConfig() ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
          当前缺少 Liuzi Supabase URL 或 Publishable Key，无法完成真实登录。
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-6 text-neutral-700">
          {errorMessages[error] ?? error}
        </p>
      ) : null}
      <form action="/api/admin/auth" method="post" className="mt-5 grid gap-4">
        <input type="hidden" name="next" value={safeNextPath(next)} />
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">邮箱</span>
          <input className="focus-ring h-10 rounded-lg border border-line bg-paper px-3 text-sm" type="email" name="email" required />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">密码</span>
          <input className="focus-ring h-10 rounded-lg border border-line bg-paper px-3 text-sm" type="password" name="password" required autoComplete="current-password" />
        </label>
        <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-policy-blue" type="submit">
          <LogIn className="h-4 w-4" />
          登录后台
        </button>
      </form>
    </section>
  );
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNextPath(value: string) {
  if (!value.startsWith("/admin") || value.startsWith("/admin/login")) {
    return "/admin";
  }

  return value;
}
