"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface SearchBarProps {
  defaultValue?: string;
  compact?: boolean;
}

export function SearchBar({ defaultValue = "", compact = false }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full gap-2">
      <label className="relative flex-1">
        <span className="sr-only">搜索政策</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索蓝卡、Einbürgerung、犬税、学生签..."
          className="focus-ring h-11 w-full rounded-lg border border-line bg-white pl-10 pr-3 text-sm text-ink shadow-sm"
        />
      </label>
      <button
        type="submit"
        className="focus-ring inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-white transition hover:bg-policy-blue"
      >
        {compact ? "搜索" : "搜索政策"}
      </button>
    </form>
  );
}
