import type { PolicyStatus } from "@/lib/types";
import { STATUS_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: PolicyStatus }) {
  const config = STATUS_CONFIG[status];

  return (
    <span className={cn("inline-flex rounded-md border px-2.5 py-1 text-xs font-medium", config.tone)}>
      {config.label}
    </span>
  );
}
