"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (!response.ok) {
        setError("退出登录失败，请稍后重试。");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("退出登录失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleLogout}
        disabled={isSubmitting}
        className="rounded-md bg-[#172033] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#344054] hover:text-white disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
      >
        {isSubmitting ? "退出中..." : "退出登录"}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
