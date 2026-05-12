import Link from "next/link";
import { ArrowRight, FileText, ShieldAlert, Workflow } from "lucide-react";
import { StatusBadge } from "@/components/policy/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import { getAdminPolicyStatsData } from "@/lib/data";
import { STATUS_CONFIG } from "@/lib/constants";
import type { PolicyStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await requireAdmin("/admin");

  const stats = await getAdminPolicyStatsData();
  const activeStatusKinds = Object.values(stats.statusCounts).filter((count) => count > 0).length;

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <AdminMetric label="全部内容" value={stats.total} icon={<FileText className="h-5 w-5" />} />
        <AdminMetric label="高风险内容" value={stats.highRisk} icon={<ShieldAlert className="h-5 w-5" />} />
        <AdminMetric label="状态种类" value={activeStatusKinds} icon={<Workflow className="h-5 w-5" />} />
      </div>

      <section className="rounded-lg border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">内容状态</h2>
          <Link
            href="/admin/policies"
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-policy-blue"
          >
            管理列表
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(STATUS_CONFIG) as PolicyStatus[]).map((status) => (
            <div key={status} className="rounded-lg border border-line bg-paper p-4">
              <StatusBadge status={status} />
              <p className="mt-3 text-2xl font-semibold text-ink">{stats.statusCounts[status] ?? 0}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AdminMetric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <p className="flex items-center gap-2 text-sm text-neutral-600">{icon}{label}</p>
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}
