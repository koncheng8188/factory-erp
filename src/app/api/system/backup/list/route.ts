import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const backupRoot = "C:\\金鸿ERP备份";

type BackupRecord = {
  name: string;
  backupDir: string;
  createdAt: string;
  displayTime: string;
  databaseExists: boolean;
  uploadsExists: boolean;
  backupInfoExists: boolean;
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
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function parseBackupTime(name: string) {
  const match = /^backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})$/.exec(name);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function isFile(filePath: string) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

async function isDirectory(directoryPath: string) {
  try {
    const directoryStat = await stat(directoryPath);
    return directoryStat.isDirectory();
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    let entries;
    try {
      entries = await readdir(backupRoot, { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return NextResponse.json({ success: true, records: [] });
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

        return {
          name: entry.name,
          backupDir,
          createdAt: createdAt.toISOString(),
          displayTime: formatDisplayTime(createdAt),
          databaseExists: await isFile(path.join(backupDir, "dev.db")),
          uploadsExists: await isDirectory(path.join(backupDir, "uploads")),
          backupInfoExists: await isFile(path.join(backupDir, "backup-info.txt"))
        };
      })
    );

    records.sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());

    return NextResponse.json({ success: true, records });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `读取备份记录失败：${errorMessage(error)}`,
        records: []
      },
      { status: 500 }
    );
  }
}
