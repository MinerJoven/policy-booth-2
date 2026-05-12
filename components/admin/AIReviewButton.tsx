"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  ok: "通过",
  needs_update: "需更新",
  source_changed: "源变化",
  source_unreachable: "源不可达",
  not_policy: "非政策",
  uncertain: "待确认"
};

export function AIReviewButton({
  policyId,
  latestStatus
}: {
  policyId: string;
  latestStatus?: string;
}) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function runReview() {
    setIsRunning(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/policies/${policyId}/review`, {
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "AI 复核失败");
      }

      setMessage(statusLabels[payload.data.review_status] ?? "已完成");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 复核失败");
    } finally {
      setIsRunning(false);
    }
  }

  const current = message || (latestStatus ? statusLabels[latestStatus] ?? latestStatus : "");
  const isProblem = ["needs_update", "source_changed", "source_unreachable", "not_policy", "uncertain"].includes(
    latestStatus ?? ""
  );

  return (
    <div className="flex min-w-36 flex-col items-start gap-2">
      {current ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
            isProblem ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          )}
        >
          {isProblem ? <TriangleAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {current}
        </span>
      ) : null}
      <button
        type="button"
        onClick={runReview}
        disabled={isRunning}
        className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-blue hover:text-policy-blue disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={cn("h-4 w-4", isRunning && "animate-spin")} />
        {isRunning ? "复核中" : "AI复核"}
      </button>
    </div>
  );
}
