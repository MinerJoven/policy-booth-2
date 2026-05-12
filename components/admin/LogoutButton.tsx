"use client";

import { LogOut } from "lucide-react";

export function LogoutButton() {
  return (
    <form action="/api/admin/auth" method="post">
      <input type="hidden" name="action" value="logout" />
      <button
        type="submit"
        className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:border-policy-red hover:text-policy-red"
      >
        <LogOut className="h-4 w-4" />
        退出
      </button>
    </form>
  );
}
