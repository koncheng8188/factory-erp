import "server-only";

import { cp, mkdir, readdir, stat } from "fs/promises";
import path from "path";

export const backupRoot = "C:\\金鸿ERP备份";
export const storageLayoutVersion = "v2-dual-source";

export function backupPaths() {
  const root = process.cwd();
  return {
    database: path.join(root, "prisma", "dev.db"),
    publicUploads: path.join(root, "public", "uploads"),
    privateUploads: path.join(root, "storage", "uploads")
  };
}

export type DirectoryStats = { exists: boolean; fileCount: number; size: number; error: boolean };

export async function inspectDirectory(directory: string): Promise<DirectoryStats> {
  try {
    const directoryStat = await stat(directory);
    if (!directoryStat.isDirectory()) return { exists: false, fileCount: 0, size: 0, error: true };
  } catch {
    return { exists: false, fileCount: 0, size: 0, error: false };
  }
  let fileCount = 0;
  let size = 0;
  try {
    async function scan(current: string): Promise<void> {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) await scan(entryPath);
        if (entry.isFile()) { const fileStat = await stat(entryPath); fileCount += 1; size += fileStat.size; }
      }
    }
    await scan(directory);
    return { exists: true, fileCount, size, error: false };
  } catch {
    return { exists: true, fileCount, size, error: true };
  }
}

export async function copyDirectoryOrCreateEmpty(source: string, target: string) {
  const sourceStats = await inspectDirectory(source);
  await mkdir(target, { recursive: true });
  if (sourceStats.exists) await cp(source, target, { recursive: true });
  const targetStats = await inspectDirectory(target);
  const matches = !sourceStats.exists || (!sourceStats.error && !targetStats.error && sourceStats.fileCount === targetStats.fileCount && sourceStats.size === targetStats.size);
  return { sourceStats, targetStats, matches };
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}
