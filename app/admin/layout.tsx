import Link from "next/link";
import { Database, FilePlus2, LayoutDashboard, ListChecks } from "lucide-react";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { DisclaimerBanner } from "@/components/layout/DisclaimerBanner";
import { getAdminUser, hasSupabaseAuthConfig } from "@/lib/auth";
import { getDataSourceLabel, isSupabaseConfigured } from "@/lib/data";

const adminNav = [
  { href: "/admin", label: "概览", icon: LayoutDashboard },
  { href: "/admin/policies", label: "政策管理", icon: ListChecks },
  { href: "/admin/policies/new", label: "新增政策", icon: FilePlus2 }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const authConfigured = hasSupabaseAuthConfig();

  return (
    <section className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-policy-blue">
            <Database className="h-4 w-4" />
            后台管理 · {getDataSourceLabel()}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">内容管理后台</h1>
        </div>
        <AdminNav />
      </div>

      {!authConfigured ? (
        <div className="mb-6">
          <DisclaimerBanner tone="warning">
            当前未配置 Supabase 登录环境变量，后台登录入口已预留，但无法完成真实登录。
          </DisclaimerBanner>
        </div>
      ) : null}

      {authConfigured && !configured ? (
        <div className="mb-6">
          <DisclaimerBanner tone="warning">
            当前缺少 Supabase Secret Key，后台写入接口会拒绝真实持久化操作。
          </DisclaimerBanner>
        </div>
      ) : null}

      {children}
    </section>
  );
}

async function AdminNav() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    return null;
  }

  return (
    <nav className="flex flex-wrap gap-2" aria-label="后台导航">
      {adminNav.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-blue hover:text-policy-blue"
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
      <LogoutButton />
    </nav>
  );
}
