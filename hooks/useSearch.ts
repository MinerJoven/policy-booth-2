"use client";

import { useEffect, useState } from "react";
import type { Policy } from "@/lib/types";

export function useSearch(query: string) {
  const [data, setData] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      queueMicrotask(() => setData([]));
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => setLoading(true));

    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => setData(result.data ?? []))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setData([]);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [query]);

  return { data, loading };
}
