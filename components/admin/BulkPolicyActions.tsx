"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export function BulkPolicyActions({
  formId,
  draftPolicyIds
}: {
  formId: string;
  draftPolicyIds: string[];
}) {
  const router = useRouter();
  const [selectedCount, setSelectedCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;

    const update = () => {
      setSelectedCount(getSelectedIds(formId).length);
    };

    update();
    form.addEventListener("change", update);
    return () => form.removeEventListener("change", update);
  }, [formId]);

  function setAllChecked(checked: boolean) {
    const form = document.getElementById(formId);
    if (!form) return;

    getCheckboxes(form).forEach((checkbox) => {
      if (!checkbox.disabled) {
        checkbox.checked = checked;
      }
    });

    setSelectedCount(getSelectedIds(formId).length);
  }

  async function publishSelected(ids: string[], label: string) {
    if (ids.length === 0 || isRunning) return;

    const confirmed = window.confirm(`将发布 ${ids.length} 条${label}，是否继续？`);
    if (!confirmed) return;

    setIsRunning(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/policies/bulk-status", {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ids,
          status: "published"
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "批量发布失败。");
      }

      setAllChecked(false);
      setMessage(`已发布 ${payload.count ?? ids.length} 条。`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量发布失败。");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => setAllChecked(true)}
        className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-blue hover:text-policy-blue"
      >
        <CheckSquare className="h-4 w-4" />
        全选
      </button>
      <button
        type="button"
        onClick={() => setAllChecked(false)}
        className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-blue hover:text-policy-blue"
      >
        <Square className="h-4 w-4" />
        清空
      </button>
      <button
        type="button"
        disabled={isRunning || selectedCount === 0}
        onClick={() => publishSelected(getSelectedIds(formId), "已选择政策")}
        className={cn(
          "focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-policy-blue",
          (isRunning || selectedCount === 0) && "cursor-not-allowed opacity-60"
        )}
      >
        <Send className="h-4 w-4" />
        {isRunning ? "发布中" : `发布所选 ${selectedCount || ""}`}
      </button>
      <button
        type="button"
        disabled={isRunning || draftPolicyIds.length === 0}
        onClick={() => publishSelected(draftPolicyIds, "本页草稿")}
        className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-green hover:text-policy-green disabled:cursor-not-allowed disabled:opacity-60"
      >
        发布本页草稿 {draftPolicyIds.length || ""}
      </button>
      {message ? <span className="text-xs text-neutral-500">{message}</span> : null}
    </div>
  );
}

function getCheckboxes(root: Element) {
  return Array.from(root.querySelectorAll<HTMLInputElement>('input[name="policyId"]'));
}

function getSelectedIds(formId: string) {
  const form = document.getElementById(formId);
  if (!form) return [];

  return getCheckboxes(form)
    .filter((checkbox) => checkbox.checked && !checkbox.disabled)
    .map((checkbox) => checkbox.value);
}
