import Link from "next/link";
import { ArrowLeft, FileSearch, ShieldCheck } from "lucide-react";
import { getAdminUser } from "@/lib/auth";
import { SITE_NAME } from "@/lib/constants";

const navItems = [
  { href: "/policies", label: "政策库" },
  { href: "/search", label: "搜索" },
  { href: "/about", label: "来源说明" }
];

export async function Header() {
  const isAdmin = Boolean(await getAdminUser());

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="https://deyuguantou-index.vercel.app"
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:border-policy-green hover:text-policy-green"
          >
            <ArrowLeft className="h-4 w-4" />
            导航页
          </Link>

          <Link href="/" className="focus-ring flex items-center gap-3 rounded-lg">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-white">
              <FileSearch className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-semibold text-ink">{SITE_NAME}</span>
              <span className="hidden text-xs text-neutral-600 sm:block">官方来源优先的中文政策展台</span>
            </span>
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="focus-ring rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-white hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          {isAdmin ? (
            <Link
              href="/admin"
              className="focus-ring rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-white hover:text-ink"
            >
              后台
            </Link>
          ) : null}
        </nav>

        <Link
          href="/about"
          className="focus-ring hidden items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-policy-green hover:text-policy-green sm:inline-flex"
        >
          <ShieldCheck className="h-4 w-4" />
          风险边界
        </Link>
      </div>
    </header>
  );
}
