"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function AIReviewBatchButton({ policyIds }: { policyIds: string[] }) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");

  async function runBatchReview() {
    if (policyIds.length === 0 || isRunning) return;

    const confirmed = window.confirm(`将依次复核当前列表中的 ${policyIds.length} 条政策，是否继续？`);
    if (!confirmed) return;

    setIsRunning(true);
    setMessage("");
    setProgress(`0/${policyIds.length}`);

    let completed = 0;
    let failed = 0;

    for (const policyId of policyIds) {
      try {
        const response = await fetch(`/api/admin/policies/${policyId}/review`, {
          method: "POST"
        });

        if (!response.ok) {
          failed += 1;
        } else {
          completed += 1;
        }
      } catch {
        failed += 1;
      }

      setProgress(`${completed + failed}/${policyIds.length}`);
    }

    setMessage(failed > 0 ? `已复核 ${completed} 条，失败 ${failed} 条` : `已复核 ${completed} 条`);
    setIsRunning(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={runBatchReview}
        disabled={isRunning || policyIds.length === 0}
        className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-blue hover:text-policy-blue disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={cn("h-4 w-4", isRunning && "animate-spin")} />
        {isRunning ? `复核中 ${progress}` : "复核本页"}
      </button>
      {message ? <span className="text-xs text-neutral-500">{message}</span> : null}
    </div>
  );
}
