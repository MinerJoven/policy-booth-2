import type { RiskLevel } from "@/lib/types";
import { RISK_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function RiskBadge({ riskLevel }: { riskLevel: RiskLevel }) {
  const config = RISK_CONFIG[riskLevel];

  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex h-2.5 w-8 rounded-full border", config.tone)}
    />
  );
}
