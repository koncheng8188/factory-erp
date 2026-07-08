"use client";

import Link from "next/link";
import { useState } from "react";

type BackupResult = {
  success: boolean;
  backupDir?: string;
  databaseCopied: boolean;
  uploadsCopied: boolean;
  error?: string;
};

const databasePath = "prisma/dev.db";
const uploadsPath = "public/uploads";
const backupTarget = "C:\\金鸿ERP备份";

function StatusBadge({ value }: { value: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${value ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
      {value ? "成功" : "未完成"}
    </span>
  );
}

export default function BackupPage() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [result, setResult] = useState<BackupResult | null>(null);

  async function handleBackup() {
    setIsBackingUp(true);
    setResult(null);

    try {
      const response = await fetch("/api/system/backup", {
        method: "POST"
      });
      const data = (await response.json()) as BackupResult;
      setResult({
        success: Boolean(data.success),
        backupDir: data.backupDir,
        databaseCopied: Boolean(data.databaseCopied),
        uploadsCopied: Boolean(data.uploadsCopied),
        error: data.error
      });
    } catch (error) {
      setResult({
        success: false,
        databaseCopied: false,
        uploadsCopied: false,
        error: error instanceof Error ? error.message : "调用备份接口失败。"
      });
    } finally {
      setIsBackingUp(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">系统备份</h1>
        <p className="mt-2 text-sm text-[#667085]">手动备份本地数据库和上传图纸，备份文件会保存到固定目录。</p>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">备份内容</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-4">
            <div className="font-medium text-[#667085]">数据库路径</div>
            <div className="mt-2 break-all font-mono text-[#172033]">{databasePath}</div>
          </div>
          <div className="rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-4">
            <div className="font-medium text-[#667085]">上传文件路径</div>
            <div className="mt-2 break-all font-mono text-[#172033]">{uploadsPath}</div>
          </div>
          <div className="rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-4">
            <div className="font-medium text-[#667085]">备份目标</div>
            <div className="mt-2 break-all font-mono text-[#172033]">{backupTarget}</div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleBackup}
            disabled={isBackingUp}
            className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#344054] disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
          >
            {isBackingUp ? "备份中..." : "一键备份"}
          </button>
          <Link
            href="/"
            className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium text-[#344054] transition hover:border-[#98a2b3] hover:bg-[#f6f7f9]"
          >
            返回首页
          </Link>
        </div>

        {result ? (
          <div className={`mt-5 rounded-md border p-4 ${result.success ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            <div className={`font-semibold ${result.success ? "text-emerald-700" : "text-red-700"}`}>
              {result.success ? "备份成功" : "备份失败"}
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-md bg-white/70 p-3">
                <div className="font-medium text-[#667085]">备份目录</div>
                <div className="mt-2 break-all font-mono text-[#172033]">{result.backupDir || "-"}</div>
              </div>
              <div className="rounded-md bg-white/70 p-3">
                <div className="font-medium text-[#667085]">数据库备份状态</div>
                <div className="mt-2">
                  <StatusBadge value={result.databaseCopied} />
                </div>
              </div>
              <div className="rounded-md bg-white/70 p-3">
                <div className="font-medium text-[#667085]">上传图纸备份状态</div>
                <div className="mt-2">
                  <StatusBadge value={result.uploadsCopied} />
                </div>
              </div>
              <div className="rounded-md bg-white/70 p-3">
                <div className="font-medium text-[#667085]">错误信息</div>
                <div className="mt-2 break-words text-[#172033]">{result.error || "-"}</div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
