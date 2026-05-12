"use client";

import { useEffect, useState } from "react";

const CONNECTING_MESSAGE = "正在接入主页登录状态...";

function hasSessionHash() {
  if (typeof window === "undefined") return false;

  const hash = new URLSearchParams(window.location.hash.slice(1));
  return Boolean(hash.get("access_token") && hash.get("refresh_token"));
}

export function SessionHashBridge({ next }: { next: string }) {
  const [message, setMessage] = useState(() => (hasSessionHash() ? CONNECTING_MESSAGE : ""));

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    if (!accessToken || !refreshToken) {
      return;
    }

    fetch("/auth/session", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        next
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("session rejected");
        }

        return response.json() as Promise<{ redirectTo?: string }>;
      })
      .then((payload) => {
        window.location.href = payload.redirectTo || next;
      })
      .catch(() => {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        setMessage("主页登录状态未能接入，请使用邮箱和密码登录。");
      });
  }, [next]);

  if (!message) {
    return null;
  }

  return <p className="mb-4 rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-6 text-neutral-700">{message}</p>;
}
