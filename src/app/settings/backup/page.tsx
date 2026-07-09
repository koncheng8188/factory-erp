"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BackupResult = {
  success: boolean;
  backupDir?: string;
  databaseCopied: boolean;
  uploadsCopied: boolean;
  error?: string;
};

type BackupRecord = {
  name: string;
  backupDir: string;
  createdAt: string;
  displayTime: string;
  databaseExists: boolean;
  uploadsExists: boolean;
  backupInfoExists: boolean;
};

type BackupRecordResponse = {
  success: boolean;
  records: BackupRecord[];
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

function ExistenceBadge({ value }: { value: boolean }) {
  return (
    <span className={`text-sm font-medium ${value ? "text-emerald-700" : "text-red-700"}`}>
      {value ? "存在" : "缺失"}
    </span>
  );
}

export default function BackupPage() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [records, setRecords] = useState<BackupRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [recordError, setRecordError] = useState("");

  async function loadBackupRecords() {
    setIsLoadingRecords(true);
    setRecordError("");

    try {
      const response = await fetch("/api/system/backup/list");
      const data = (await response.json()) as BackupRecordResponse;
      setRecords(Array.isArray(data.records) ? data.records : []);
      if (!data.success) {
        setRecordError(data.error || "读取备份记录失败。");
      }
    } catch (error) {
      setRecords([]);
      setRecordError(error instanceof Error ? error.message : "读取备份记录失败。");
    } finally {
      setIsLoadingRecords(false);
    }
  }

  useEffect(() => {
    void loadBackupRecords();
  }, []);

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
      void loadBackupRecords();
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
            className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#344054] hover:text-white disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
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

      <section className="rounded-md border border-[#d8dde6] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">备份记录</h2>
            <p className="mt-1 text-sm text-[#667085]">仅显示固定备份目录下的 backup_ 文件夹，不读取文件内容。</p>
          </div>
          <button
            type="button"
            onClick={() => void loadBackupRecords()}
            disabled={isLoadingRecords}
            className="rounded-md border border-[#cfd6e1] px-3 py-2 text-sm font-medium text-[#344054] transition hover:border-[#98a2b3] hover:bg-[#f6f7f9] disabled:cursor-not-allowed disabled:text-[#98a2b3]"
          >
            {isLoadingRecords ? "刷新中..." : "刷新记录"}
          </button>
        </div>

        {recordError ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{recordError}</div> : null}

        <div className="mt-4 space-y-3">
          {isLoadingRecords ? (
            <div className="rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-4 text-sm text-[#667085]">正在读取备份记录...</div>
          ) : records.length === 0 ? (
            <div className="rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-4 text-sm text-[#667085]">暂无备份记录</div>
          ) : (
            records.map((record) => (
              <div key={record.backupDir} className="rounded-md border border-[#eef2f6] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[#172033]">{record.name}</div>
                    <div className="mt-1 text-sm text-[#667085]">备份时间：{record.displayTime}</div>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      数据库：<ExistenceBadge value={record.databaseExists} />
                    </div>
                    <div>
                      上传图纸：<ExistenceBadge value={record.uploadsExists} />
                    </div>
                    <div>
                      说明文件：<ExistenceBadge value={record.backupInfoExists} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 break-all rounded-md bg-[#f6f7f9] px-3 py-2 font-mono text-xs text-[#667085]">{record.backupDir}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
