"use client";

import type { PolicyStatus } from "@/lib/types";
import { STATUS_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";

const transitions: { value: PolicyStatus; label: string }[] = [
  { value: "draft", label: "保存草稿" },
  { value: "published", label: "发布" },
  { value: "unpublished", label: "下架" },
  { value: "expired", label: "标记过期" }
];

export function StatusControl({
  value,
  onChange
}: {
  value: PolicyStatus;
  onChange: (value: PolicyStatus) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-neutral-700">发布状态</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {transitions.map((item) => {
          const active = value === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={cn(
                "focus-ring rounded-lg border px-3 py-2 text-sm font-medium transition",
                active
                  ? STATUS_CONFIG[item.value].tone
                  : "border-line bg-white text-neutral-700 hover:border-policy-blue"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
