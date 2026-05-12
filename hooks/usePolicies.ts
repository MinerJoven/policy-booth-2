"use client";

import { useEffect, useState } from "react";
import type { Policy } from "@/lib/types";

export function usePolicies(query = "") {
  const [data, setData] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => setLoading(true));

    fetch(`/api/policies${query}`, { signal: controller.signal })
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
