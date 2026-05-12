"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { CATEGORIES, REGION_LEVELS, REGIONS, TARGET_GROUPS } from "@/lib/constants";

const daysOptions = [
  { value: "", label: "全部时间" },
  { value: "7", label: "最近 7 天" },
  { value: "30", label: "最近 30 天" },
  { value: "90", label: "最近 90 天" }
];

const sortOptions = [
  { value: "published_at", label: "最新发布优先" },
  { value: "effective_at", label: "最近生效优先" },
  { value: "risk_level", label: "影响等级高优先" },
  { value: "view_count", label: "热门浏览优先" }
];

export function FilterPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const regionOptions = Array.from(new Set([...REGIONS.states, ...REGIONS.cities]));

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    if (key === "region_level" && value === "联邦") {
      params.delete("region_name");
    }

    if (key === "days") {
      params.delete("date_from");
      params.delete("date_to");
    }

    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function resetFilters() {
    router.replace(pathname);
  }

  const regionLevel = searchParams.get("region_level") ?? "";

  return (
    <aside className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <SlidersHorizontal className="h-4 w-4" />
          筛选
        </h2>
        <button
          type="button"
          onClick={resetFilters}
          className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-paper"
        >
          <X className="h-3.5 w-3.5" />
          清空
        </button>
      </div>

      <div className="mt-4 grid gap-4">
        <SelectField
          label="地区层级"
          value={regionLevel}
          onChange={(value) => updateParam("region_level", value)}
          options={[{ value: "", label: "全部层级" }, ...REGION_LEVELS.map((level) => ({ value: level, label: level }))]}
        />

        <SelectField
          label="具体地区"
          value={searchParams.get("region_name") ?? ""}
          disabled={regionLevel === "联邦"}
          onChange={(value) => updateParam("region_name", value)}
          options={[
            { value: "", label: regionLevel === "联邦" ? "联邦政策无需选择地区" : "全部地区" },
            ...regionOptions.map((region) => ({ value: region, label: region }))
          ]}
        />

        <SelectField
          label="政策类别"
          value={searchParams.get("category") ?? ""}
          onChange={(value) => updateParam("category", value)}
          options={[{ value: "", label: "全部类别" }, ...CATEGORIES.map((category) => ({ value: category.value, label: category.label }))]}
        />

        <SelectField
          label="适用人群"
          value={searchParams.get("target_group") ?? ""}
          onChange={(value) => updateParam("target_group", value)}
          options={[{ value: "", label: "全部人群" }, ...TARGET_GROUPS.map((group) => ({ value: group, label: group }))]}
        />

        <SelectField
          label="发布时间"
          value={searchParams.get("days") ?? ""}
          onChange={(value) => updateParam("days", value)}
          options={daysOptions}
        />

        <SelectField
          label="排序"
          value={searchParams.get("sort") ?? "published_at"}
          onChange={(value) => updateParam("sort", value)}
          options={sortOptions}
        />
      </div>
    </aside>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring h-10 rounded-lg border border-line bg-paper px-3 text-sm text-ink disabled:cursor-not-allowed disabled:text-neutral-400"
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
