import { NextResponse } from "next/server";
import { copyFile, mkdir, rename, rm, stat, writeFile, open } from "fs/promises";
import path from "path";
import { execFileSync } from "child_process";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth/api-user";
import { backupPaths, backupRoot, copyDirectoryOrCreateEmpty, storageLayoutVersion } from "@/lib/system-backup";

export const runtime = "nodejs";

function timestamp() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`; }
function git(args: string[], fallback: string) { try { return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", timeout: 3000, windowsHide: true }).trim() || fallback; } catch { return fallback; } }

export async function POST() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const name = `backup_${timestamp()}`;
  const tempDir = path.join(backupRoot, `${name}_tmp`);
  const finalDir = path.join(backupRoot, name);
  const paths = backupPaths();
  try {
    await mkdir(backupRoot, { recursive: true });
    await mkdir(tempDir, { recursive: false });
    const databaseStat = await stat(paths.database);
    if (!databaseStat.isFile() || databaseStat.size <= 0) throw new Error("数据库文件不可用。");
    await copyFile(paths.database, path.join(tempDir, "dev.db"));
    const copiedDatabase = await stat(path.join(tempDir, "dev.db"));
    const handle = await open(path.join(tempDir, "dev.db"), "r");
    const header = Buffer.alloc(16); await handle.read(header, 0, 16, 0); await handle.close();
    if (copiedDatabase.size !== databaseStat.size || !header.equals(Buffer.from("SQLite format 3\0", "ascii"))) throw new Error("数据库备份校验失败。");
    const publicCopy = await copyDirectoryOrCreateEmpty(paths.publicUploads, path.join(tempDir, "uploads"));
    const privateCopy = await copyDirectoryOrCreateEmpty(paths.privateUploads, path.join(tempDir, "private-uploads"));
    const drawingCount = await prisma.partDrawing.count();
    if ((publicCopy.sourceStats.exists && !publicCopy.matches) || (privateCopy.sourceStats.exists && !privateCopy.matches) || (drawingCount > 0 && !publicCopy.sourceStats.exists && !privateCopy.sourceStats.exists)) throw new Error("上传文件备份校验失败。");
    const privateStatus = privateCopy.sourceStats.exists ? "存在" : "尚未启用";
    const info = ["项目名称：金鸿ERP", `备份时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`, `Git提交：${git(["rev-parse", "HEAD"], "无法读取")}`, `Git标签：${git(["describe", "--tags", "--exact-match"], "当前提交未打标签")}`, `存储布局版本：${storageLayoutVersion}`, "公开存储源：public/uploads", `公开存储状态：${publicCopy.sourceStats.exists ? "存在" : "不存在"}`, `公开存储文件数：${publicCopy.sourceStats.fileCount}`, `公开存储总大小：${publicCopy.sourceStats.size}`, "私有存储源：storage/uploads", `私有存储状态：${privateStatus}`, `私有存储文件数：${privateCopy.sourceStats.fileCount}`, `私有存储总大小：${privateCopy.sourceStats.size}`, "备份公开目录：uploads", "备份私有目录：private-uploads", `PartDrawing记录数：${drawingCount}`, "备份健康状态：正常"].join("\n");
    await writeFile(path.join(tempDir, "backup-info.txt"), info, "utf8");
    await rename(tempDir, finalDir);
    return NextResponse.json({ success: true, backupDir: name, databaseCopied: true, uploadsCopied: publicCopy.sourceStats.exists, privateUploadsCopied: privateCopy.sourceStats.exists });
  } catch (error) {
    try { await rm(tempDir, { recursive: true, force: true }); } catch {}
    return NextResponse.json({ success: false, databaseCopied: false, uploadsCopied: false, error: error instanceof Error ? `创建备份失败：${error.message}` : "创建备份失败。" }, { status: 500 });
  }
}
