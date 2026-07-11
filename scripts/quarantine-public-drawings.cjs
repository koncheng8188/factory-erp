/* eslint-disable no-console */
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { execFileSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");

const mode = process.argv[2] || "--dry-run";
const validModes = new Set(["--dry-run", "--quarantine", "--verify"]);
const projectRoot = process.cwd();
const auditRoot = "C:\\金鸿ERP备份";
const databasePath = path.join(projectRoot, "prisma", "dev.db");
const directories = {
  public: {
    original: path.join(projectRoot, "public", "uploads", "drawings", "originals"),
    thumbnail: path.join(projectRoot, "public", "uploads", "drawings", "thumbnails")
  },
  private: {
    original: path.join(projectRoot, "storage", "uploads", "drawings", "originals"),
    thumbnail: path.join(projectRoot, "storage", "uploads", "drawings", "thumbnails")
  }
};
const prefixes = {
  original: "/uploads/drawings/originals/",
  thumbnail: "/uploads/drawings/thumbnails/"
};
const safeFileName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

function fail(message) {
  throw new Error(message);
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function hash(filePath) {
  return fs.readFile(filePath).then((data) => crypto.createHash("sha256").update(data).digest("hex"));
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
  return allowedExtensions.has(path.extname(fileName).toLowerCase()) ? fileName : null;
}

function safePath(directory, fileName) {
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

async function pathExists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
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

function hasProblems(problems) {
  return Object.values(problems).some((items) => items.length > 0);
}

async function manifestFromDatabase(prisma) {
  const drawings = await prisma.partDrawing.findMany({
    orderBy: { id: "asc" },
    select: { id: true, originalUrl: true, thumbnailUrl: true, printThumbnailUrl: true }
  });
  const references = { original: new Set(), thumbnail: new Set() };
  const problems = { missing: [], conflict: [], orphan: [], illegal: [] };
  for (const drawing of drawings) {
    const original = fileNameFromLegacyUrl(drawing.originalUrl, "original");
    if (!original) addProblem(problems, "illegal", `${drawing.id}:original`);
    else references.original.add(original);
    const thumbnails = [drawing.thumbnailUrl, drawing.printThumbnailUrl].filter((value) => value !== null);
    if (thumbnails.length === 1 && (drawing.thumbnailUrl === null || drawing.printThumbnailUrl === null)) addProblem(problems, "illegal", `${drawing.id}:thumbnail-pair`);
    for (const value of thumbnails) {
      const thumbnail = fileNameFromLegacyUrl(value, "thumbnail");
      if (!thumbnail) addProblem(problems, "illegal", `${drawing.id}:thumbnail`);
      else references.thumbnail.add(thumbnail);
    }
  }
  if (drawings.length !== 11) addProblem(problems, "illegal", `PartDrawing-count:${drawings.length}`);
  if (references.original.size !== 11) addProblem(problems, "illegal", `original-count:${references.original.size}`);
  if (references.thumbnail.size !== 8) addProblem(problems, "illegal", `thumbnail-count:${references.thumbnail.size}`);

  const manifest = [];
  for (const type of ["original", "thumbnail"]) {
    for (const fileName of references[type]) {
      const publicPath = safePath(directories.public[type], fileName);
      const privatePath = safePath(directories.private[type], fileName);
      if (!publicPath || !privatePath) {
        addProblem(problems, "illegal", `${type}:${fileName}`);
        continue;
      }
      const publicStat = await statFile(publicPath);
      const privateStat = await statFile(privatePath);
      if (!publicStat) addProblem(problems, "missing", `public:${type}:${fileName}`);
      if (!privateStat) addProblem(problems, "missing", `private:${type}:${fileName}`);
      if (!publicStat || !privateStat) continue;
      const [publicHash, privateHash] = await Promise.all([hash(publicPath), hash(privatePath)]);
      if (publicStat.size !== privateStat.size || publicHash !== privateHash) addProblem(problems, "conflict", `${type}:${fileName}`);
      manifest.push({ type, filename: fileName, publicPath, privatePath, size: publicStat.size, sha256: publicHash, status: "planned" });
    }
    for (const fileName of await businessFiles(directories.public[type])) if (!references[type].has(fileName)) addProblem(problems, "orphan", `public:${type}:${fileName}`);
    for (const fileName of await businessFiles(directories.private[type])) if (!references[type].has(fileName)) addProblem(problems, "orphan", `private:${type}:${fileName}`);
  }
  return { drawings, manifest, problems };
}

function summary(drawings, manifest, problems, extra = {}) {
  return {
    partDrawing: drawings.length,
    publicBusiness: manifest.length,
    privateBusiness: manifest.length,
    originals: manifest.filter((item) => item.type === "original").length,
    thumbnails: manifest.filter((item) => item.type === "thumbnail").length,
    planned: manifest.length,
    missing: problems.missing.length,
    conflict: problems.conflict.length,
    orphan: problems.orphan.length,
    illegal: problems.illegal.length,
    ...extra
  };
}

async function rollback(moved) {
  const unrecovered = [];
  for (const item of [...moved].reverse()) {
    try {
      if (await statFile(item.publicPath)) {
        unrecovered.push(`${item.type}:${item.filename}`);
        continue;
      }
      await fs.rename(item.quarantinePath, item.publicPath);
    } catch {
      unrecovered.push(`${item.type}:${item.filename}`);
    }
  }
  return unrecovered;
}

async function quarantine(manifest, databaseHash) {
  const name = `drawing_public_quarantine_${timestamp()}`;
  const temporaryDirectory = path.join(auditRoot, `${name}_tmp`);
  const finalDirectory = path.join(auditRoot, name);
  const moved = [];
  let keepTemporaryDirectory = false;
  try {
    if (await pathExists(finalDirectory) || await pathExists(temporaryDirectory)) fail("隔离目录冲突。");
    await fs.mkdir(temporaryDirectory, { recursive: false });
    await fs.mkdir(path.join(temporaryDirectory, "originals"), { recursive: false });
    await fs.mkdir(path.join(temporaryDirectory, "thumbnails"), { recursive: false });
    for (const item of manifest) {
      const quarantineDirectory = item.type === "original" ? "originals" : "thumbnails";
      item.quarantinePath = safePath(path.join(temporaryDirectory, quarantineDirectory), item.filename);
      if (!item.quarantinePath || await statFile(item.quarantinePath)) fail(`隔离文件冲突：${item.type}:${item.filename}`);
      await fs.rename(item.publicPath, item.quarantinePath);
      moved.push(item);
      const [quarantineStat, privateStat] = await Promise.all([statFile(item.quarantinePath), statFile(item.privatePath)]);
      const [quarantineHash, privateHash] = await Promise.all([hash(item.quarantinePath), hash(item.privatePath)]);
      if (!quarantineStat || !privateStat || quarantineStat.size !== item.size || privateStat.size !== item.size || quarantineHash !== item.sha256 || privateHash !== item.sha256) fail(`移动校验失败：${item.type}:${item.filename}`);
      item.status = "moved";
    }
    if (await hash(databasePath) !== databaseHash) fail("正式数据库哈希发生变化。");
    const manifestOutput = manifest.map(({ type, filename, size, sha256, status }) => ({ type, filename, size, sha256, status }));
    const info = [
      `执行时间：${new Date().toISOString()}`,
      `Git HEAD：${execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim()}`,
      "PartDrawing数量：11",
      `隔离原图数量：${manifest.filter((item) => item.type === "original").length}`,
      `隔离缩略图数量：${manifest.filter((item) => item.type === "thumbnail").length}`,
      "public剩余业务文件数量：0",
      `private文件数量：${manifest.length}`,
      `隔离文件数量：${manifest.length}`,
      "校验结果：通过",
      `执行前数据库SHA-256：${databaseHash}`
    ].join("\n") + "\n";
    await fs.writeFile(path.join(temporaryDirectory, "quarantine-info.txt"), info, { encoding: "utf8", flag: "wx" });
    await fs.writeFile(path.join(temporaryDirectory, "manifest.json"), `${JSON.stringify(manifestOutput, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (await hash(databasePath) !== databaseHash) fail("正式数据库哈希发生变化。");
    await fs.rename(temporaryDirectory, finalDirectory);
    return { moved: manifest.length, originalsMoved: manifest.filter((item) => item.type === "original").length, thumbnailsMoved: manifest.filter((item) => item.type === "thumbnail").length, auditName: name, rollbackFailed: 0 };
  } catch (error) {
    const unrecovered = await rollback(moved);
    if (unrecovered.length > 0) {
      keepTemporaryDirectory = true;
      console.error(JSON.stringify({ result: "rollback-failed", unrecovered }));
    }
    if (!keepTemporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function findLatestQuarantine() {
  const entries = await fs.readdir(auditRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^drawing_public_quarantine_\d{8}_\d{6}$/.test(entry.name)) continue;
    const directory = path.join(auditRoot, entry.name);
    if (await statFile(path.join(directory, "quarantine-info.txt")) && await statFile(path.join(directory, "manifest.json"))) {
      candidates.push({ name: entry.name, directory, modified: (await fs.stat(directory)).mtimeMs });
    }
  }
  candidates.sort((a, b) => b.modified - a.modified);
  return candidates[0] ?? null;
}

async function verify(prisma) {
  const quarantine = await findLatestQuarantine();
  const problems = { missing: [], conflict: [], orphan: [], illegal: [] };
  if (!quarantine) addProblem(problems, "missing", "quarantine-directory");
  const { drawings, manifest } = await manifestFromDatabaseForVerify(prisma, problems);
  if (quarantine) {
    for (const item of manifest) {
      const quarantinePath = safePath(path.join(quarantine.directory, item.type === "original" ? "originals" : "thumbnails"), item.filename);
      const quarantineStat = quarantinePath ? await statFile(quarantinePath) : null;
      if (!quarantineStat) addProblem(problems, "missing", `quarantine:${item.type}:${item.filename}`);
      else if (quarantineStat.size !== item.size || await hash(quarantinePath) !== item.sha256) addProblem(problems, "conflict", `quarantine:${item.type}:${item.filename}`);
    }
    for (const type of ["original", "thumbnail"]) {
      const expected = new Set(manifest.filter((item) => item.type === type).map((item) => item.filename));
      const privateActual = await businessFiles(directories.private[type]);
      for (const fileName of privateActual) if (!expected.has(fileName)) addProblem(problems, "orphan", `private:${type}:${fileName}`);
      if (privateActual.length !== expected.size) addProblem(problems, "conflict", `private:${type}-count:${privateActual.length}`);
      const actual = await businessFiles(path.join(quarantine.directory, type === "original" ? "originals" : "thumbnails"));
      for (const fileName of actual) if (!expected.has(fileName)) addProblem(problems, "orphan", `quarantine:${type}:${fileName}`);
      if (actual.length !== expected.size) addProblem(problems, "conflict", `quarantine:${type}-count:${actual.length}`);
    }
  }
  const publicBusiness = (await businessFiles(directories.public.original)).length + (await businessFiles(directories.public.thumbnail)).length;
  const publicKeep = (await fs.readdir(path.join(projectRoot, "public", "uploads"), { recursive: true })).filter((value) => path.basename(value) === ".gitkeep").length;
  if (publicBusiness !== 0) addProblem(problems, "conflict", `public-business:${publicBusiness}`);
  if (publicKeep !== 4) addProblem(problems, "conflict", `public-gitkeep:${publicKeep}`);
  return { drawings, manifest, problems, auditName: quarantine?.name ?? null, publicBusiness, publicKeep };
}

async function manifestFromDatabaseForVerify(prisma, problems) {
  const drawings = await prisma.partDrawing.findMany({ orderBy: { id: "asc" }, select: { id: true, originalUrl: true, thumbnailUrl: true, printThumbnailUrl: true } });
  const refs = { original: new Set(), thumbnail: new Set() };
  for (const drawing of drawings) {
    const original = fileNameFromLegacyUrl(drawing.originalUrl, "original");
    if (!original) addProblem(problems, "illegal", `${drawing.id}:original`); else refs.original.add(original);
    for (const value of [drawing.thumbnailUrl, drawing.printThumbnailUrl].filter((item) => item !== null)) {
      const thumbnail = fileNameFromLegacyUrl(value, "thumbnail");
      if (!thumbnail) addProblem(problems, "illegal", `${drawing.id}:thumbnail`); else refs.thumbnail.add(thumbnail);
    }
  }
  const manifest = [];
  for (const type of ["original", "thumbnail"]) for (const fileName of refs[type]) {
    const privatePath = safePath(directories.private[type], fileName);
    const privateStat = privatePath ? await statFile(privatePath) : null;
    if (!privateStat) { addProblem(problems, "missing", `private:${type}:${fileName}`); continue; }
    manifest.push({ type, filename: fileName, privatePath, size: privateStat.size, sha256: await hash(privatePath) });
  }
  if (drawings.length !== 11 || refs.original.size !== 11 || refs.thumbnail.size !== 8) addProblem(problems, "illegal", "database-count");
  return { drawings, manifest };
}

async function main() {
  if (!validModes.has(mode) || process.argv.length > 3) fail("用法：node scripts/quarantine-public-drawings.cjs [--dry-run|--quarantine|--verify]");
  const prisma = new PrismaClient();
  try {
    const databaseHash = await hash(databasePath);
    if (mode === "--verify") {
      const result = await verify(prisma);
      const output = summary(result.drawings, result.manifest, result.problems, { publicBusiness: result.publicBusiness, publicGitkeep: result.publicKeep, auditName: result.auditName, verified: result.manifest.length, result: hasProblems(result.problems) ? "failed" : "passed" });
      console.log(JSON.stringify(output));
      if (hasProblems(result.problems)) process.exitCode = 1;
      return;
    }
    const result = await manifestFromDatabase(prisma);
    const output = summary(result.drawings, result.manifest, result.problems);
    if (hasProblems(result.problems)) {
      console.log(JSON.stringify({ mode, ...output, result: "failed" }));
      process.exitCode = 1;
      return;
    }
    if (mode === "--dry-run") {
      console.log(JSON.stringify({ mode, ...output, result: "passed" }));
      return;
    }
    const moved = await quarantine(result.manifest, databaseHash);
    console.log(JSON.stringify({ mode, ...output, ...moved, result: "passed" }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : "隔离失败。");
  process.exitCode = 1;
});
