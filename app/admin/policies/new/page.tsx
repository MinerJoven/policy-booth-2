import { PolicyForm } from "@/components/admin/PolicyForm";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewPolicyPage() {
  await requireAdmin("/admin/policies/new");

  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold text-ink">新增政策</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          按结构化字段录入政策内容，避免把所有信息写在一个大文本框里。
        </p>
      </div>
      <PolicyForm />
    </section>
  );
}
