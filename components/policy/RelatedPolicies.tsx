import { PolicyCard } from "@/components/policy/PolicyCard";
import type { PolicyV2 } from "@/lib/types-v2";

export function RelatedPolicies({ policies }: { policies: PolicyV2[] }) {
  if (policies.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-line pt-8">
      <h2 className="text-xl font-semibold text-ink">相关政策推荐</h2>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {policies.map((policy) => (
          <PolicyCard key={policy.id} policy={policy} />
        ))}
      </div>
    </section>
  );
}
