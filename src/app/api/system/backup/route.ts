import { NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { access, copyFile, cp, mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { requireApiUser } from "@/lib/auth/api-user";

export const runtime = "nodejs";

const backupRoot = "C:\\金鸿ERP备份";
const gitTimeout = 3000;

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function formatTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());
  const hour = padNumber(date.getHours());
  const minute = padNumber(date.getMinutes());
  const second = padNumber(date.getSeconds());
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

async function ensureFile(filePath: string) {
  await access(filePath);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`${filePath} 不是文件。`);
  }
}

async function ensureDirectory(directoryPath: string) {
  await access(directoryPath);
  const directoryStat = await stat(directoryPath);
  if (!directoryStat.isDirectory()) {
    throw new Error(`${directoryPath} 不是文件夹。`);
  }
}

async function createUniqueBackupDirectory(baseDir: string) {
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? baseDir : `${baseDir}_${index}`;

    try {
      await mkdir(candidate, { recursive: false });
      return candidate;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : null;
      if (code !== "EEXIST") {
        throw error;
      }
    }
  }

  throw new Error("备份目录重复次数过多，请稍后重试。");
}

export async function POST() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const projectRoot = process.cwd();
  const databaseSource = path.join(projectRoot, "prisma", "dev.db");
  const uploadsSource = path.join(projectRoot, "public", "uploads");
  let backupDir = path.join(backupRoot, `backup_${formatTimestamp(new Date())}`);
  const errors: string[] = [];
  let databaseCopied = false;
  let uploadsCopied = false;
  let infoWritten = false;

  try {
    await mkdir(backupRoot, { recursive: true });
    backupDir = await createUniqueBackupDirectory(backupDir);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        backupDir,
        databaseCopied,
        uploadsCopied,
        error: `创建备份目录失败：${errorMessage(error)}`
      },
      { status: 500 }
    );
  }

  try {
    await ensureFile(databaseSource);
    await copyFile(databaseSource, path.join(backupDir, "dev.db"));
    databaseCopied = true;
  } catch (error) {
    errors.push(`数据库备份失败：${errorMessage(error)}`);
  }

  try {
    await ensureDirectory(uploadsSource);
    await cp(uploadsSource, path.join(backupDir, "uploads"), { recursive: true });
    uploadsCopied = true;
  } catch (error) {
    errors.push(`上传图纸备份失败：${errorMessage(error)}`);
  }

  try {
    const backupTime = new Date().toLocaleString("zh-CN", { hour12: false });
    const gitVersion = readGitVersion();
    const backupInfo = [
      "项目名称：金鸿ERP",
      `备份时间：${backupTime}`,
      `数据库来源：${databaseSource}`,
      `上传文件来源：${uploadsSource}`,
      `备份目录：${backupDir}`,
      `Git提交：${gitVersion.commit}`,
      `Git标签：${gitVersion.tag}`,
      "说明：此备份包含数据库和上传图纸，不包含 node_modules 和 .next。",
      "说明：代码请通过 GitHub 或 Git 标签备份。"
    ].join("\n");
    await writeFile(path.join(backupDir, "backup-info.txt"), backupInfo, "utf8");
    infoWritten = true;
  } catch (error) {
    errors.push(`备份说明写入失败：${errorMessage(error)}`);
  }

  const success = databaseCopied && uploadsCopied && infoWritten && errors.length === 0;

  return NextResponse.json(
    {
      success,
      backupDir,
      databaseCopied,
      uploadsCopied,
      ...(success ? {} : { error: errors.join("；") || "备份失败。" })
    },
    { status: success ? 200 : 500 }
  );
}
