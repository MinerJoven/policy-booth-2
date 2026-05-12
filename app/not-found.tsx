import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center px-5 py-20">
      <p className="text-sm font-medium text-policy-blue">404</p>
      <h1 className="mt-3 text-3xl font-semibold text-ink">没有找到对应内容</h1>
      <p className="mt-4 text-base leading-7 text-neutral-700">
        这条链接可能已经被移动，或者当前演示数据中没有对应政策。
      </p>
      <Link
        href="/policies"
        className="focus-ring mt-8 inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium shadow-soft transition hover:border-policy-blue hover:text-policy-blue"
      >
        <ArrowLeft className="h-4 w-4" />
        返回政策列表
      </Link>
    </section>
  );
}
