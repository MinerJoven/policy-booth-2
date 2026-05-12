import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";

export async function requireAdminApi() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
