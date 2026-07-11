/* eslint-disable no-console */
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { execFileSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");

const mode = process.argv[2] || "--dry-run";
const validModes = new Set(["--dry-run", "--copy", "--verify"]);
const projectRoot = process.cwd();
const sourceDirectories = {
  original: path.join(projectRoot, "public", "uploads", "drawings", "originals"),
  thumbnail: path.join(projectRoot, "public", "uploads", "drawings", "thumbnails")
};
const targetDirectories = {
  original: path.join(projectRoot, "storage", "uploads", "drawings", "originals"),
  thumbnail: path.join(projectRoot, "storage", "uploads", "drawings", "thumbnails")
};
const auditRoot = "C:\\金鸿ERP备份";
const databasePath = path.join(projectRoot, "prisma", "dev.db");
const prefixes = {
  original: "/uploads/drawings/originals/",
  thumbnail: "/uploads/drawings/thumbnails/"
};
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const safeFileName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function fail(message) {
  const error = new Error(message);
  error.expected = true;
  throw error;
}

function display(value) {
  console.log(value);
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function sha256(filePath) {
  return fs.readFile(filePath).then((buffer) => crypto.createHash("sha256").update(buffer).digest("hex"));
}

function fileNameFromLegacyUrl(value, type) {
  if (typeof value !== "string" || !value.startsWith(prefixes[type])) return null;
  let fileName;
  try {
    fileName = decodeURIComponent(value.slice(prefixes[type].length));
  } catch {
    return null;
  }
  if (!fileName || !safeFileName.test(fileName)) return null;
  if (fileName.includes("..") || /[\\/\0:]/.test(fileName) || path.isAbsolute(fileName) || /^[A-Za-z]:/.test(fileName)) return null;
  if (!allowedExtensions.has(path.extname(fileName).toLowerCase())) return null;
  return fileName;
}

function safeFilePath(directory, fileName) {
  const root = path.resolve(directory);
  const candidate = path.resolve(root, fileName);
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? candidate : null;
}

async function statFile(filePath) {
  try {
    const details = await fs.stat(filePath);
    return details.isFile() ? details : null;
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function businessFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name !== ".gitkeep").map((entry) => entry.name);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

function addProblem(problems, kind, detail) {
  problems[kind].push(detail);
}

async function buildManifest(prisma) {
  const drawings = await prisma.partDrawing.findMany({
    orderBy: { id: "asc" },
    select: { id: true, originalUrl: true, thumbnailUrl: true, printThumbnailUrl: true }
  });
  const problems = { missing: [], orphan: [], conflict: [], illegal: [] };
  const references = { original: new Map(), thumbnail: new Map() };

  for (const drawing of drawings) {
    const originalName = fileNameFromLegacyUrl(drawing.originalUrl, "original");
    if (!originalName) {
      addProblem(problems, "illegal", `${drawing.id}:original`);
    } else {
      references.original.set(originalName, drawing.id);
    }

    const thumbnailValues = [drawing.thumbnailUrl, drawing.printThumbnailUrl].filter((value) => value !== null);
    if (thumbnailValues.length === 1 && (drawing.thumbnailUrl === null || drawing.printThumbnailUrl === null)) {
      addProblem(problems, "illegal", `${drawing.id}:thumbnail-pair`);
    }
    for (const value of thumbnailValues) {
      const thumbnailName = fileNameFromLegacyUrl(value, "thumbnail");
      if (!thumbnailName) addProblem(problems, "illegal", `${drawing.id}:thumbnail`);
      else references.thumbnail.set(thumbnailName, drawing.id);
    }
  }

  const manifest = [];
  for (const type of ["original", "thumbnail"]) {
    for (const [fileName] of references[type]) {
      const sourcePath = safeFilePath(sourceDirectories[type], fileName);
      const targetPath = safeFilePath(targetDirectories[type], fileName);
      if (!sourcePath || !targetPath) {
        addProblem(problems, "illegal", `${type}:${fileName}`);
        continue;
      }
      const sourceStat = await statFile(sourcePath);
      if (!sourceStat) {
        addProblem(problems, "missing", `${type}:${fileName}`);
        continue;
      }
      manifest.push({ type, filename: fileName, sourcePath, targetPath, size: sourceStat.size, sha256: await sha256(sourcePath) });
    }
    const diskFiles = await businessFiles(sourceDirectories[type]);
    for (const fileName of diskFiles) {
      if (!references[type].has(fileName)) addProblem(problems, "orphan", `${type}:${fileName}`);
    }
  }

  if (drawings.length !== 11) addProblem(problems, "illegal", `PartDrawing-count:${drawings.length}`);
  if (references.original.size !== 11) addProblem(problems, "illegal", `original-count:${references.original.size}`);
  if (references.thumbnail.size !== 8) addProblem(problems, "illegal", `thumbnail-count:${references.thumbnail.size}`);
  return { drawings, manifest, problems };
}

async function checkTargets(manifest, problems) {
  let existingIdentical = 0;
  for (const item of manifest) {
    const targetStat = await statFile(item.targetPath);
    if (!targetStat) continue;
    const targetHash = await sha256(item.targetPath);
    if (targetStat.size === item.size && targetHash === item.sha256) {
      item.status = "existing-and-identical";
      existingIdentical += 1;
    } else {
      addProblem(problems, "conflict", `${item.type}:${item.filename}`);
    }
  }
  return existingIdentical;
}

function summary(drawings, manifest, problems, existingIdentical) {
  return {
    partDrawing: drawings.length,
    originals: manifest.filter((item) => item.type === "original").length,
    thumbnails: manifest.filter((item) => item.type === "thumbnail").length,
    planned: manifest.length,
    existingIdentical,
    missing: problems.missing.length,
    orphan: problems.orphan.length,
    conflict: problems.conflict.length,
    illegal: problems.illegal.length
  };
}

function report(result) {
  display(JSON.stringify(result));
}

function hasProblems(problems) {
  return Object.values(problems).some((items) => items.length > 0);
}

async function removeCreatedFiles(createdFiles) {
  await Promise.all(createdFiles.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)));
}

async function copyAndVerify(manifest, databaseHash) {
  const createdFiles = [];
  let temporaryAuditDirectory = null;
  try {
    await Promise.all(Object.values(targetDirectories).map((directory) => fs.mkdir(directory, { recursive: true })));
    for (const item of manifest) {
      if (item.status === "existing-and-identical") continue;
      try {
        await fs.copyFile(item.sourcePath, item.targetPath, fs.constants.COPYFILE_EXCL);
        createdFiles.push(item.targetPath);
      } catch (error) {
        if (!(error && error.code === "EEXIST")) createdFiles.push(item.targetPath);
        throw error;
      }
      const targetStat = await statFile(item.targetPath);
      const targetHash = targetStat ? await sha256(item.targetPath) : null;
      if (!targetStat || targetStat.size !== item.size || targetHash !== item.sha256) fail(`复制校验失败：${item.type}:${item.filename}`);
      item.status = "copied";
    }

    if (await sha256(databasePath) !== databaseHash) fail("正式数据库哈希发生变化。");
    await fs.mkdir(auditRoot, { recursive: true });
    const auditName = `drawing_migration_${timestamp()}`;
    temporaryAuditDirectory = path.join(auditRoot, `${auditName}_tmp`);
    const finalAuditDirectory = path.join(auditRoot, auditName);
    await fs.mkdir(temporaryAuditDirectory, { recursive: false });
    const auditManifest = manifest.map(({ type, filename, size, sha256: fileHash, status }) => ({ type, filename, size, sha256: fileHash, status }));
    const info = [
      `执行时间：${new Date().toISOString()}`,
      `Git HEAD：${execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim()}`,
      `PartDrawing数量：${manifest.length === 19 ? 11 : "异常"}`,
      `原图数量：${manifest.filter((item) => item.type === "original").length}`,
      `缩略图数量：${manifest.filter((item) => item.type === "thumbnail").length}`,
      `复制成功数量：${manifest.filter((item) => item.status === "copied").length}`,
      `跳过且一致数量：${manifest.filter((item) => item.status === "existing-and-identical").length}`,
      "缺失数量：0",
      "冲突数量：0",
      "校验结果：通过",
      `正式数据库SHA-256：${databaseHash}`
    ].join("\n") + "\n";
    await fs.writeFile(path.join(temporaryAuditDirectory, "migration-info.txt"), info, { encoding: "utf8", flag: "wx" });
    await fs.writeFile(path.join(temporaryAuditDirectory, "manifest.json"), `${JSON.stringify(auditManifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (await sha256(databasePath) !== databaseHash) fail("正式数据库哈希发生变化。");
    await fs.rename(temporaryAuditDirectory, finalAuditDirectory);
    temporaryAuditDirectory = null;
    return { copied: manifest.filter((item) => item.status === "copied").length, existingIdentical: manifest.filter((item) => item.status === "existing-and-identical").length, auditName };
  } catch (error) {
    await removeCreatedFiles(createdFiles);
    if (temporaryAuditDirectory) await fs.rm(temporaryAuditDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function verify(manifest, problems) {
  for (const item of manifest) {
    const targetStat = await statFile(item.targetPath);
    const targetHash = targetStat ? await sha256(item.targetPath) : null;
    if (!targetStat || targetStat.size !== item.size || targetHash !== item.sha256) addProblem(problems, "conflict", `${item.type}:${item.filename}`);
  }
}

async function main() {
  if (!validModes.has(mode) || process.argv.length > 3) fail("用法：node scripts/migrate-drawings-to-private.cjs [--dry-run|--copy|--verify]");
  const prisma = new PrismaClient();
  try {
    const databaseHash = await sha256(databasePath);
    const { drawings, manifest, problems } = await buildManifest(prisma);
    const existingIdentical = await checkTargets(manifest, problems);
    if (mode === "--verify") await verify(manifest, problems);
    const initialSummary = summary(drawings, manifest, problems, existingIdentical);
    if (hasProblems(problems)) {
      report({ mode, ...initialSummary, result: "failed" });
      process.exitCode = 1;
      return;
    }
    if (mode === "--dry-run") {
      report({ mode, ...initialSummary, result: "passed" });
      return;
    }
    if (mode === "--verify") {
      report({ mode, ...initialSummary, verified: manifest.length, result: "passed" });
      return;
    }
    const copyResult = await copyAndVerify(manifest, databaseHash);
    report({ mode, ...initialSummary, ...copyResult, result: "passed" });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : "迁移失败。");
  process.exitCode = 1;
});
