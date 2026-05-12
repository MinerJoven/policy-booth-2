import { notFound } from "next/navigation";
import { PolicyForm } from "@/components/admin/PolicyForm";
import { requireAdmin } from "@/lib/auth";
import { getPolicyByIdData } from "@/lib/data";

interface EditPolicyPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditPolicyPage({ params }: EditPolicyPageProps) {
  const { id } = await params;
  await requireAdmin(`/admin/policies/${id}`);

  const policy = await getPolicyByIdData(id, { includeHidden: true });

  if (!policy) {
    notFound();
  }

  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold text-ink">编辑政策</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{policy.titleZh}</p>
      </div>
      <PolicyForm initialPolicy={policy} />
    </section>
  );
}
