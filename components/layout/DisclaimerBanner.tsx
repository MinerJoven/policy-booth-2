import { AlertTriangle } from "lucide-react";
import { LEGAL_DISCLAIMER } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface DisclaimerBannerProps {
  tone?: "neutral" | "danger" | "warning";
  children?: React.ReactNode;
}

export function DisclaimerBanner({ tone = "neutral", children }: DisclaimerBannerProps) {
  const toneClass = {
    neutral: "border-line bg-white text-neutral-700",
    danger: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900"
  }[tone];

  return (
    <div className={cn("rounded-lg border px-4 py-3", toneClass)}>
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-sm leading-6">{children ?? LEGAL_DISCLAIMER}</p>
      </div>
    </div>
  );
}
