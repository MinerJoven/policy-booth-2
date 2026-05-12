import Link from "next/link";
import { LEGAL_DISCLAIMER, SITE_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="font-semibold text-ink">{SITE_NAME}</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">{LEGAL_DISCLAIMER}</p>
        </div>
        <div className="flex flex-wrap items-start gap-3 md:justify-end">
          <Link className="text-sm text-neutral-600 hover:text-ink" href="/policies">
            政策库
          </Link>
          <Link className="text-sm text-neutral-600 hover:text-ink" href="/search">
            搜索
          </Link>
          <Link className="text-sm text-neutral-600 hover:text-ink" href="/about">
            来源说明
          </Link>
        </div>
      </div>
    </footer>
  );
}
