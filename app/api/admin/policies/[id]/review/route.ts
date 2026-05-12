import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api";
import { runPolicyAiReview, toReviewRecord, type PolicyReviewInput } from "@/lib/policy-review";
import { getPoliciesTable, getPolicyReviewsTable, getSupabaseAdminClient } from "@/lib/supabase";

interface AdminReviewRouteProps {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: AdminReviewRouteProps) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 503 });
  }

  const { id } = await params;
  const { data: policy, error: policyError } = await supabase
    .from(getPoliciesTable())
    .select("*")
    .eq("id", id)
    .single();

  if (policyError || !policy) {
    return NextResponse.json({ error: policyError?.message ?? "Policy not found." }, { status: 404 });
  }

  try {
    const review = await runPolicyAiReview(policy as PolicyReviewInput);
    const record = toReviewRecord(policy as PolicyReviewInput, review);
    const { data, error } = await supabase
      .from(getPolicyReviewsTable())
      .insert(record)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
