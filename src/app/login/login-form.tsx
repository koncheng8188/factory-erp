"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [employeeNo, setEmployeeNo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeNo, password }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) { setError(data.error || "登录失败，请稍后重试"); return; }
      router.replace("/"); router.refresh();
    } catch { setError("登录失败，请稍后重试"); } finally { setIsSubmitting(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] px-5"><form onSubmit={handleSubmit} className="w-full max-w-md rounded-md border border-[#d8dde6] bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold text-[#172033]">金鸿ERP 登录</h1><div className="mt-6 space-y-4"><label className="block text-sm font-medium text-[#344054]">员工编号<input value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value)} autoComplete="username" className="mt-2 w-full rounded-md border border-[#cfd6e1] px-3 py-2 text-[#172033] outline-none focus:border-[#667085]" /></label><label className="block text-sm font-medium text-[#344054]">密码<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" className="mt-2 w-full rounded-md border border-[#cfd6e1] px-3 py-2 text-[#172033] outline-none focus:border-[#667085]" /></label></div>{error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}<button disabled={isSubmitting} className="mt-6 w-full rounded-md bg-[#172033] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#344054] hover:text-white disabled:cursor-not-allowed disabled:bg-[#98a2b3]">{isSubmitting ? "登录中..." : "登录"}</button></form></main>;
}
