"use client";

import { FormEvent, useCallback, useTransition, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { GERMAN_STATES_DISPLAY, JOB_TAGS, WORK_TYPES } from "@/lib/constants";

export function JobsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  // Read current filter values from URL
  const currentState = searchParams.get("state_code") ?? "";
  const currentWorkTypes = searchParams.getAll("work_type");
  const currentTags = searchParams.getAll("tag");

  function buildUrl(updates: Record<string, string | string[] | null>) {
    const params = new URLSearchParams();
    // Preserve existing params
    for (const [key, values] of Object.entries(Object.fromEntries(searchParams.entries()))) {
      if (key === "q" || key === "state_code" || key === "work_type" || key === "tag" || key === "page") continue;
      params.set(key, Array.isArray(values) ? values[0] : values);
    }
    // Apply updates
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") continue;
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, v);
      } else {
        params.set(key, value);
      }
    }
    // Reset page on filter change
    params.delete("page");
    return `/jobs?${params.toString()}`;
  }

  function navigate(url: string) {
    startTransition(() => {
      router.push(url);
    });
  }

  function handleStateChange(value: string) {
    navigate(buildUrl({ state_code: value || null }));
  }

  function handleWorkTypeChange(value: string) {
    // Single-select: just set the new work type directly
    navigate(buildUrl({ work_type: value || null }));
  }

  function handleTagToggle(tagValue: string) {
    const next = currentTags.includes(tagValue)
      ? currentTags.filter((t) => t !== tagValue)
      : [...currentTags, tagValue];
    navigate(buildUrl({ tag: next.length > 0 ? next : null }));
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(buildUrl({ q: query.trim() || null }));
  }

  function clearAll() {
    router.push("/jobs");
  }

  const hasFilters = currentState || currentWorkTypes.length > 0 || currentTags.length > 0 || query;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="flex w-full gap-2">
        <label className="relative flex-1">
          <span className="sr-only">搜索职位</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索职位名称、雇主..."
            className="focus-ring h-11 w-full rounded-lg border border-line bg-white pl-10 pr-3 text-sm text-ink shadow-sm"
          />
        </label>
        <button
          type="submit"
          className="focus-ring inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-white transition hover:bg-policy-blue"
        >
          搜索
        </button>
      </form>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3">
        {/* State select */}
        <select
          value={currentState}
          onChange={(e) => handleStateChange(e.target.value)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
        >
          <option value="">所有州</option>
          {GERMAN_STATES_DISPLAY.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Work type select */}
        <select
          value={currentWorkTypes[0] ?? ""}
          onChange={(e) => handleWorkTypeChange(e.target.value)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
        >
          <option value="">所有工作类型</option>
          {WORK_TYPES.map((w) => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </select>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearAll}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-neutral-600 hover:border-red-400 hover:text-red-600"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* Tag pills */}
      <div className="flex flex-wrap gap-2">
        {JOB_TAGS.map((tag) => {
          const active = currentTags.includes(tag.value);
          return (
            <button
              key={tag.value}
              onClick={() => handleTagToggle(tag.value)}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-policy-green bg-policy-green text-white"
                  : "border-line bg-paper text-neutral-700 hover:border-policy-green hover:text-policy-green"
              }`}
            >
              {tag.label}
            </button>
          );
        })}
      </div>

      {isPending && (
        <p className="text-xs text-neutral-400">加载中...</p>
      )}
    </div>
  );
}
