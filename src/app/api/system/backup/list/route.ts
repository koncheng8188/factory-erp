import { NextResponse } from "next/server";
import { open, readdir, readFile, stat } from "fs/promises";
import path from "path";
import { execFileSync } from "child_process";
import { requireApiUser } from "@/lib/auth/api-user";
import { backupRoot, formatFileSize, inspectDirectory } from "@/lib/system-backup";

export const runtime = "nodejs";
const sqliteHeader = Buffer.from("SQLite format 3\0", "ascii");
function git(args: string[], fallback: string) { try { return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", timeout: 3000, windowsHide: true }).trim() || fallback; } catch { return fallback; } }
function infoValue(content: string, label: string, fallback: string) { return new RegExp(`^${label}：(.*)$`, "m").exec(content)?.[1]?.trim() || fallback; }

export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  try {
    const entries = await readdir(backupRoot, { withFileTypes: true }).catch(() => []);
    const records = await Promise.all(entries.filter(e => e.isDirectory() && /^backup_\d{8}_\d{6}(?:_\d+)?$/.test(e.name)).map(async entry => {
      const dir = path.join(backupRoot, entry.name);
      const databasePath = path.join(dir, "dev.db");
      const [database, publicUploads, privateUploads, info] = await Promise.all([stat(databasePath).catch(() => null), inspectDirectory(path.join(dir, "uploads")), inspectDirectory(path.join(dir, "private-uploads")), readFile(path.join(dir, "backup-info.txt"), "utf8").catch(() => "")]);
      let sqliteHeaderValid = false;
      if (database?.isFile() && database.size > 0) { const handle = await open(databasePath, "r"); const header = Buffer.alloc(16); await handle.read(header, 0, 16, 0); await handle.close(); sqliteHeaderValid = header.equals(sqliteHeader); }
      const layoutVersion = infoValue(info, "存储布局版本", privateUploads.exists ? "v2-dual-source" : "v1-legacy-public");
      const databaseExists = !!database?.isFile();
      const backupInfoExists = Boolean(info);
      const complete = databaseExists && (database?.size ?? 0) > 0 && sqliteHeaderValid && backupInfoExists && publicUploads.exists && !publicUploads.error && (layoutVersion === "v1-legacy-public" || (privateUploads.exists && !privateUploads.error));
      const createdAt = (await stat(dir)).mtime;
      return { name: entry.name, createdAt: createdAt.toISOString(), displayTime: createdAt.toLocaleString("zh-CN", { hour12: false }), databaseExists, uploadsExists: publicUploads.exists, backupInfoExists, databaseSize: database?.size ?? 0, databaseSizeText: formatFileSize(database?.size ?? 0), uploadsFileCount: publicUploads.fileCount, uploadsSize: publicUploads.size, uploadsSizeText: formatFileSize(publicUploads.size), totalSize: (database?.size ?? 0) + publicUploads.size + privateUploads.size + Buffer.byteLength(info), totalSizeText: formatFileSize((database?.size ?? 0) + publicUploads.size + privateUploads.size + Buffer.byteLength(info)), sqliteHeaderValid, databaseReadable: databaseExists, uploadsReadable: publicUploads.exists && !publicUploads.error, infoReadable: backupInfoExists, recordedGitCommit: infoValue(info, "Git提交", "未记录（旧备份）"), recordedGitTag: infoValue(info, "Git标签", "未记录（旧备份）"), healthStatus: complete ? "COMPLETE" : "INCOMPLETE", healthLabel: complete ? "正常" : "异常", healthMessages: complete ? ["必要文件存在，基础文件检查正常。"] : ["备份文件或上传目录检查失败。"], storageLayoutVersion: layoutVersion, privateUploadsExists: privateUploads.exists, privateUploadsFileCount: privateUploads.fileCount, privateUploadsSize: privateUploads.size, privateUploadsSizeText: formatFileSize(privateUploads.size), privateStorageStatus: infoValue(info, "私有存储状态", privateUploads.exists ? "存在" : layoutVersion === "v1-legacy-public" ? "旧备份未记录" : "尚未启用") };
    }));
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ success: true, records, currentGitCommit: git(["rev-parse", "HEAD"], "无法读取"), currentGitTag: git(["describe", "--tags", "--exact-match"], "当前提交未打标签") });
  } catch { return NextResponse.json({ success: false, error: "读取备份记录失败。", records: [], currentGitCommit: "无法读取", currentGitTag: "未标记" }, { status: 500 }); }
}
