import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyDetail } from "@/components/policy/PolicyDetail";
import { getPolicyBySlugData } from "@/lib/data-v2";

export const revalidate = 3600;

interface PolicyDetailPageProps {
  params: Promise<{ slug: string }>;
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

  return <PolicyDetail policy={policy} />;
}
