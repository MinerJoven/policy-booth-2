import { NextRequest, NextResponse } from "next/server";
import { getPolicyByIdData, getPolicyBySlugData } from "@/lib/data";

interface PolicyApiRouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: PolicyApiRouteProps) {
  const { id } = await params;
  const policy = (await getPolicyByIdData(id)) ?? (await getPolicyBySlugData(id));

  if (!policy || !["published", "expired"].includes(policy.status)) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  return NextResponse.json({ data: policy });
}
