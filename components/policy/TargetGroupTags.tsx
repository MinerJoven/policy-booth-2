import { Users } from "lucide-react";

export function TargetGroupTags({ targetGroups }: { targetGroups: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {targetGroups.map((group) => (
        <span
          key={group}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-neutral-700"
        >
          <Users className="h-3.5 w-3.5" />
          {group}
        </span>
      ))}
    </div>
  );
}
