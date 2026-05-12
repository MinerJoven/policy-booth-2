import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyDetail } from "@/components/policy/PolicyDetail";
import { RelatedPolicies } from "@/components/policy/RelatedPolicies";
import { getPolicyByIdData, getPolicyBySlugData, getRelatedPoliciesData } from "@/lib/data";
import { mockPolicies } from "@/lib/mock-policies";

export const revalidate = 3600;

interface PolicyDetailPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return mockPolicies.map((policy) => ({ slug: policy.slug }));
}

export async function generateMetadata({ params }: PolicyDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const policy = await getPolicyBySlugData(slug);

  if (!policy) {
    return {
      title: "政策未找到"
    };
  }

  return {
    title: policy.titleZh,
    description: policy.summaryZh,
    openGraph: {
      title: policy.titleZh,
      description: policy.summaryZh
    }
  };
}

export default async function PolicyDetailPage({ params }: PolicyDetailPageProps) {
  const { slug } = await params;
  const policy = await getPolicyBySlugData(slug);

  if (!policy) {
    notFound();
  }

  const supersededByPolicy = policy.supersededBy ? await getPolicyByIdData(policy.supersededBy) : undefined;
  const relatedPolicies = await getRelatedPoliciesData(policy);

  return (
    <>
      <PolicyDetail policy={policy} supersededByPolicy={supersededByPolicy} />
      <div className="mx-auto max-w-7xl px-5 pb-12">
        <RelatedPolicies policies={relatedPolicies} />
      </div>
    </>
  );
}
