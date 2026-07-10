import { NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { open, readdir, readFile, stat } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const backupRoot = "C:\\金鸿ERP备份";
const gitTimeout = 3000;
const sqliteHeader = Buffer.from("SQLite format 3\0", "ascii");

type HealthStatus = "COMPLETE" | "WARNING" | "INCOMPLETE";

type BackupRecord = {
  name: string;
  backupDir: string;
  createdAt: string;
  displayTime: string;
  databaseExists: boolean;
  uploadsExists: boolean;
  backupInfoExists: boolean;
  databaseSize: number;
  databaseSizeText: string;
  uploadsFileCount: number;
  uploadsSize: number;
  uploadsSizeText: string;
  totalSize: number;
  totalSizeText: string;
  sqliteHeaderValid: boolean;
  databaseReadable: boolean;
  uploadsReadable: boolean;
  infoReadable: boolean;
  recordedGitCommit: string;
  recordedGitTag: string;
  healthStatus: HealthStatus;
  healthLabel: string;
  healthMessages: string[];
};

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function formatDisplayTime(date: Date) {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());
  const hour = padNumber(date.getHours());
  const minute = padNumber(date.getMinutes());
  const second = padNumber(date.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function parseBackupTime(name: string) {
  const match = /^backup_(\d{8})_(\d{4}|\d{6})(?:_(\d+))?$/.exec(name);
  if (!match) return null;

  const [, datePart, timePart] = match;
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(4, 6));
  const day = Number(datePart.slice(6, 8));
  const hour = Number(timePart.slice(0, 2));
  const minute = Number(timePart.slice(2, 4));
  const second = timePart.length === 6 ? Number(timePart.slice(4, 6)) : 0;
  const date = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    0
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function readGitValue(args: string[], fallback: string) {
  try {
    const result = execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: gitTimeout,
      windowsHide: true
    });
    return result.trim() || fallback;
  } catch {
    return fallback;
  }
}

function readGitVersion() {
  return {
    commit: readGitValue(["rev-parse", "HEAD"], "无法读取"),
    tag: readGitValue(["describe", "--tags", "--exact-match"], "未标记")
  };
}

async function getFileStat(filePath: string) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() ? fileStat : null;
  } catch {
    return null;
  }
}

async function getDirectoryStat(directoryPath: string) {
  try {
    const directoryStat = await stat(directoryPath);
    return directoryStat.isDirectory() ? directoryStat : null;
  } catch {
    return null;
  }
}

async function inspectDatabase(databasePath: string) {
  const databaseStat = await getFileStat(databasePath);
  const databaseExists = databaseStat !== null;
  const databaseSize = databaseStat?.size ?? 0;
  let databaseReadable = false;
  let sqliteHeaderValid = false;
  let readError = false;

  if (databaseExists && databaseSize > 0) {
    try {
      const handle = await open(databasePath, "r");
      try {
        const headerBuffer = Buffer.alloc(16);
        const { bytesRead } = await handle.read(headerBuffer, 0, 16, 0);
        databaseReadable = true;
        sqliteHeaderValid = bytesRead === 16 && headerBuffer.equals(sqliteHeader);
      } finally {
        await handle.close();
      }
    } catch {
      readError = true;
    }
  }

  return { databaseExists, databaseSize, databaseReadable, sqliteHeaderValid, readError };
}

async function inspectUploads(uploadsPath: string): Promise<{ exists: boolean; readable: boolean; fileCount: number; size: number; error: boolean }> {
  const uploadsStat = await getDirectoryStat(uploadsPath);
  if (!uploadsStat) {
    return { exists: false, readable: false, fileCount: 0, size: 0, error: false };
  }

  let fileCount = 0;
  let size = 0;

  async function scanDirectory(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          await scanDirectory(entryPath);
          return;
        }

        if (entry.isFile()) {
          const entryStat = await stat(entryPath);
          fileCount += 1;
          size += entryStat.size;
        }
      })
    );
  }

  try {
    await scanDirectory(uploadsPath);
    return { exists: true, readable: true, fileCount, size, error: false };
  } catch {
    return { exists: true, readable: false, fileCount, size, error: true };
  }
}

async function inspectBackupInfo(infoPath: string) {
  const infoStat = await getFileStat(infoPath);
  if (!infoStat) {
    return { exists: false, readable: false, size: 0, recordedGitCommit: "未记录（旧备份）", recordedGitTag: "未记录（旧备份）" };
  }

  try {
    const content = await readFile(infoPath, "utf8");
    const commit = /^Git提交：(.*)$/m.exec(content)?.[1]?.trim();
    const tag = /^Git标签：(.*)$/m.exec(content)?.[1]?.trim();
    return {
      exists: true,
      readable: true,
      size: infoStat.size,
      recordedGitCommit: commit || "未记录（旧备份）",
      recordedGitTag: tag || "未记录（旧备份）"
    };
  } catch {
    return { exists: true, readable: false, size: infoStat.size, recordedGitCommit: "未记录（旧备份）", recordedGitTag: "未记录（旧备份）" };
  }
}

function resolveHealthStatus(criticalMessages: string[], warningMessages: string[]) {
  if (criticalMessages.length > 0) {
    return { status: "INCOMPLETE" as const, label: "不完整", messages: [...criticalMessages, ...warningMessages] };
  }

  if (warningMessages.length > 0) {
    return { status: "WARNING" as const, label: "警告", messages: warningMessages };
  }

  return { status: "COMPLETE" as const, label: "完整", messages: ["必要文件存在，基础文件检查正常。"] };
}

export async function GET() {
  try {
    let entries;
    try {
      entries = await readdir(backupRoot, { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        const currentGitVersion = readGitVersion();
        return NextResponse.json({ success: true, records: [], currentGitCommit: currentGitVersion.commit, currentGitTag: currentGitVersion.tag });
      }
      throw error;
    }

    const backupDirectories = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("backup_"));
    const records: BackupRecord[] = await Promise.all(
      backupDirectories.map(async (entry) => {
        const backupDir = path.join(backupRoot, entry.name);
        const directoryStat = await stat(backupDir);
        const parsedDate = parseBackupTime(entry.name);
        const createdAt = parsedDate ?? directoryStat.mtime;
        const databasePath = path.join(backupDir, "dev.db");
        const uploadsPath = path.join(backupDir, "uploads");
        const infoPath = path.join(backupDir, "backup-info.txt");
        const [database, uploads, info] = await Promise.all([
          inspectDatabase(databasePath),
          inspectUploads(uploadsPath),
          inspectBackupInfo(infoPath)
        ]);
        const criticalMessages: string[] = [];
        const warningMessages: string[] = [];

        if (!database.databaseExists) {
          criticalMessages.push("缺少 dev.db 文件。");
        } else if (database.databaseSize === 0) {
          criticalMessages.push("dev.db 文件大小为 0 字节。");
        } else if (database.databaseReadable && !database.sqliteHeaderValid) {
          criticalMessages.push("dev.db 的 SQLite 文件头不正确。");
        } else if (!database.databaseReadable || database.readError) {
          warningMessages.push("无法读取 dev.db 文件头。");
        }

        if (!uploads.exists) {
          criticalMessages.push("缺少 uploads 目录。");
        } else if (!uploads.readable || uploads.error) {
          warningMessages.push("uploads 目录或文件统计读取失败。");
        }

        if (!info.exists) {
          criticalMessages.push("缺少 backup-info.txt 文件。");
        } else if (!info.readable) {
          warningMessages.push("无法读取 backup-info.txt 内容。");
        }

        const health = resolveHealthStatus(criticalMessages, warningMessages);
        const totalSize = database.databaseSize + uploads.size + info.size;

        return {
          name: entry.name,
          backupDir,
          createdAt: createdAt.toISOString(),
          displayTime: formatDisplayTime(createdAt),
          databaseExists: database.databaseExists,
          uploadsExists: uploads.exists,
          backupInfoExists: info.exists,
          databaseSize: database.databaseSize,
          databaseSizeText: formatFileSize(database.databaseSize),
          uploadsFileCount: uploads.fileCount,
          uploadsSize: uploads.size,
          uploadsSizeText: formatFileSize(uploads.size),
          totalSize,
          totalSizeText: formatFileSize(totalSize),
          sqliteHeaderValid: database.sqliteHeaderValid,
          databaseReadable: database.databaseReadable,
          uploadsReadable: uploads.readable,
          infoReadable: info.readable,
          recordedGitCommit: info.recordedGitCommit,
          recordedGitTag: info.recordedGitTag,
          healthStatus: health.status,
          healthLabel: health.label,
          healthMessages: health.messages
        };
      })
    );

    records.sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());

    const currentGitVersion = readGitVersion();
    return NextResponse.json({ success: true, records, currentGitCommit: currentGitVersion.commit, currentGitTag: currentGitVersion.tag });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `读取备份记录失败：${errorMessage(error)}`,
        records: [],
        currentGitCommit: "无法读取",
        currentGitTag: "未标记"
      },
      { status: 500 }
    );
  }
}
