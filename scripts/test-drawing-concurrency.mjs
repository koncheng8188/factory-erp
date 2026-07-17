import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import sharp from "sharp";
import {
  DrawingUploadError,
  MAX_VERSION_CREATE_ATTEMPTS,
  uploadDrawingBatch
} from "../src/lib/drawing-upload-integrity.ts";
import {
  DrawingMainError,
  MAX_MAIN_SWITCH_ATTEMPTS,
  setMainDrawing
} from "../src/lib/drawing-main-integrity.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const formalDb = path.join(root, "prisma", "dev.db");
const privateRoot = path.join(root, "storage");
const publicRoot = path.join(root, "public");
const temporaryRoot = path.join(tmpdir(), `jinhong-drawing-concurrency-${process.pid}-${randomUUID()}`);
const databasePath = path.join(temporaryRoot, "drawing-concurrency.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
const storageRoot = path.join(temporaryRoot, "storage");
const originals = path.join(storageRoot, "originals");
const thumbnails = path.join(storageRoot, "thumbnails");
const printThumbnails = path.join(storageRoot, "print-thumbnails");
const clients = [];

let client;
let competitor;
let order;
let product;
let png;
let formalDbHash;
let privateTreeBefore;
let publicTreeBefore;
let cleaned = false;
let directConflict;
let directPart;
let directOtherPart;
let maxBatch;
let gapResult;
let obsoleteResult;
let oneConflict;
let twoConflicts;
let exhausted;
let foreignKeyFailure;
let unknownFailure;
let firstUploadRace;
let versionThenMain;
let mainThenVersion;
let twoVersionsThenMain;
let directMainConflict;
let directMainPart;
let mainSwitch;
let missingMainError;
let obsoleteMainError;
let mappedMainConflict;
let lockRetry;
let lockExhausted;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function hashFile(filePath) {
  return sha256(await readFile(filePath));
}

async function treeSummary(directory) {
  const entries = [];
  async function visit(current) {
    let children;
    try {
      children = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, child.name);
      if (child.isDirectory()) await visit(absolute);
      else {
        const buffer = await readFile(absolute);
        entries.push({
          path: path.relative(directory, absolute).replaceAll("\\", "/"),
          length: buffer.length,
          sha256: sha256(buffer)
        });
      }
    }
  }
  await visit(directory);
  return entries;
}

async function countFiles(directory) {
  return (await treeSummary(directory)).length;
}

async function createPart(name) {
  return client.productPart.create({
    data: {
      orderId: order.id,
      productId: product.id,
      partName: `${name}-${randomUUID()}`,
      unitQuantity: 1,
      productQuantity: 1,
      totalQuantity: 1,
      status: "PENDING"
    }
  });
}

function drawingData(part, version, marker, status = "PENDING") {
  return {
    orderId: order.id,
    productId: product.id,
    partId: part.id,
    fileName: `${marker}-${version}.pdf`,
    fileType: "pdf",
    originalUrl: `/competition/${marker}-${version}.pdf`,
    version,
    isMain: false,
    status
  };
}

function trackedPng(name, stats) {
  return {
    name,
    type: "image/png",
    size: png.length,
    arrayBuffer: async () => {
      stats.arrayBuffer += 1;
      return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
    }
  };
}

function trackedDependencies(label, stats, beforeVersionCreateAttempt) {
  return {
    now: () => 1700000000000,
    randomId: () => {
      stats.uuid += 1;
      return `${label}-uuid-${stats.uuid}`;
    },
    onImageMetadataValidated: () => {
      stats.metadata += 1;
    },
    writeOriginal: async (targetPath, buffer) => {
      stats.originalWrites += 1;
      await writeFile(targetPath, buffer, { flag: "wx" });
    },
    createThumbnail: async (buffer, targetPath) => {
      stats.thumbnailWrites += 1;
      await sharp(buffer).webp().toFile(targetPath);
    },
    beforeVersionCreateAttempt
  };
}

function newStats() {
  return {
    arrayBuffer: 0,
    metadata: 0,
    originalWrites: 0,
    thumbnailWrites: 0,
    uuid: 0,
    attempts: []
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function pdfFile(name) {
  return {
    name,
    type: "application/pdf",
    size: 9,
    arrayBuffer: async () => Buffer.from("%PDF-1.4")
  };
}

async function seedVersion(part, version, status = "PENDING", marker = "seed") {
  return client.partDrawing.create({ data: drawingData(part, version, `${marker}-${randomUUID()}`, status) });
}

before(async () => {
  formalDbHash = await hashFile(formalDb);
  privateTreeBefore = await treeSummary(privateRoot);
  publicTreeBefore = await treeSummary(publicRoot);
  png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "#ffffff" } }).png().toBuffer();

  await mkdir(temporaryRoot, { recursive: false });
  await Promise.all([
    mkdir(originals, { recursive: true }),
    mkdir(thumbnails, { recursive: true }),
    mkdir(printThumbnails, { recursive: true })
  ]);
  await writeFile(databasePath, "");
  const command = process.platform === "win32"
    ? "npx.cmd prisma migrate deploy --schema prisma/schema.prisma"
    : "npx prisma migrate deploy --schema prisma/schema.prisma";
  const migration = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });
  assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);

  client = new PrismaClient({ datasourceUrl: databaseUrl });
  competitor = new PrismaClient({ datasourceUrl: databaseUrl });
  clients.push(client, competitor);
  const customer = await client.customer.create({ data: { name: "图纸并发测试" } });
  order = await client.order.create({
    data: {
      orderNo: `DRAW-CONCURRENCY-${randomUUID()}`,
      customerId: customer.id,
      customerName: customer.name,
      status: "PENDING"
    }
  });
  product = await client.product.create({
    data: { orderId: order.id, productName: "图纸并发测试产品", quantity: 1, status: "PENDING" }
  });
});

after(async () => {
  if (!cleaned) {
    await Promise.allSettled(clients.map((item) => item.$disconnect()));
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("01. 临时 SQLite 包含版本复合唯一索引", async () => {
  const rows = await client.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'PartDrawing_partId_version_key'"
  );
  assert.equal(rows.length, 1);
});

test("02. 唯一索引第一列为 partId", async () => {
  const columns = await client.$queryRawUnsafe("PRAGMA index_info('PartDrawing_partId_version_key')");
  assert.equal(columns[0].name, "partId");
});

test("03. 唯一索引第二列为 version", async () => {
  const columns = await client.$queryRawUnsafe("PRAGMA index_info('PartDrawing_partId_version_key')");
  assert.equal(columns[1].name, "version");
});

test("04. 临时 SQLite 已创建主图部分唯一索引", async () => {
  const rows = await client.$queryRawUnsafe(
    "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'PartDrawing_partId_main_key'"
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].sql, /WHERE\s+"isMain"\s*=\s*1/i);
});

test("05. 同一 partId 和 version 真实触发约束错误", async () => {
  directPart = await createPart("direct");
  await seedVersion(directPart, 1, "OBSOLETE", "direct-obsolete");
  try {
    await competitor.partDrawing.create({ data: drawingData(directPart, 1, "direct-conflict") });
  } catch (error) {
    directConflict = error;
  }
  assert.ok(directConflict);
});

test("06. 约束错误是 PrismaClientKnownRequestError", () => {
  assert.ok(directConflict instanceof Prisma.PrismaClientKnownRequestError);
});

test("07. 约束错误 code 精确为 P2002", () => {
  assert.equal(directConflict.code, "P2002");
});

test("08. 不同 partId 可以使用相同 version", async () => {
  directOtherPart = await createPart("direct-other");
  const created = await client.partDrawing.create({ data: drawingData(directOtherPart, 1, "direct-other") });
  assert.equal(created.version, 1);
});

test("09. 同一 partId 可以使用不同 version", async () => {
  const created = await client.partDrawing.create({ data: drawingData(directPart, 2, "direct-next") });
  assert.equal(created.version, 2);
});

test("10. OBSOLETE 记录永久占用原 version", () => {
  assert.equal(directConflict.code, "P2002");
});

test("11. 空历史从 version 1 开始", async () => {
  const part = await createPart("empty-history");
  const result = await uploadDrawingBatch({
    files: [{ name: "empty.pdf", type: "application/pdf", size: 9, arrayBuffer: async () => Buffer.from("%PDF-1.4") }],
    part,
    client,
    remark: null,
    storageRoot
  });
  assert.equal(result.drawings[0].version, 1);
});

test("12. 历史最大 version 为 4 时新批从 5 开始", async () => {
  const part = await createPart("max-four");
  await seedVersion(part, 1);
  await seedVersion(part, 4, "CONFIRMED");
  const files = [1, 2, 3].map((number) => ({
    name: `batch-${number}.pdf`,
    type: "application/pdf",
    size: 9,
    arrayBuffer: async () => Buffer.from("%PDF-1.4")
  }));
  maxBatch = await uploadDrawingBatch({ files, part, client, remark: null, storageRoot });
  assert.equal(maxBatch.drawings[0].version, 5);
});

test("13. 同批第二个文件连续分配 version 6", () => {
  assert.equal(maxBatch.drawings[1].version, 6);
});

test("14. 同批第三个文件连续分配 version 7", () => {
  assert.equal(maxBatch.drawings[2].version, 7);
});

test("15. 历史存在 1、3 时不补 version 2", async () => {
  const part = await createPart("gap");
  await seedVersion(part, 1);
  await seedVersion(part, 3);
  gapResult = await uploadDrawingBatch({
    files: [{ name: "gap.pdf", type: "application/pdf", size: 9, arrayBuffer: async () => Buffer.from("%PDF-1.4") }],
    part,
    client,
    remark: null,
    storageRoot
  });
  assert.equal(gapResult.drawings[0].version, 4);
});

test("16. OBSOLETE 最大版本参与下一个版本计算", async () => {
  const part = await createPart("obsolete-max");
  await seedVersion(part, 2, "PENDING");
  await seedVersion(part, 5, "OBSOLETE");
  obsoleteResult = await uploadDrawingBatch({
    files: [{ name: "obsolete.pdf", type: "application/pdf", size: 9, arrayBuffer: async () => Buffer.from("%PDF-1.4") }],
    part,
    client,
    remark: null,
    storageRoot
  });
  assert.equal(obsoleteResult.drawings[0].version, 6);
});

test("17. 成功响应 version 与数据库记录一致", async () => {
  const stored = await client.partDrawing.findUnique({ where: { id: obsoleteResult.drawings[0].id } });
  assert.equal(stored.version, obsoleteResult.drawings[0].version);
});

test("18. 最大数据库创建尝试常量为 3", () => {
  assert.equal(MAX_VERSION_CREATE_ATTEMPTS, 3);
});

test("19. 一次冲突由第二 PrismaClient 确定性插入", async () => {
  const part = await createPart("one-conflict");
  const stats = newStats();
  oneConflict = { part, stats, planned: [], inserted: [] };
  const beforeVersionCreateAttempt = async ({ attempt, versions }) => {
    stats.attempts.push(attempt);
    oneConflict.planned.push([...versions]);
    if (attempt === 1) {
      const created = await competitor.partDrawing.create({
        data: drawingData(part, versions[0], `one-conflict-${attempt}`)
      });
      oneConflict.inserted.push(created);
    }
  };
  oneConflict.result = await uploadDrawingBatch({
    files: [trackedPng("one-conflict.png", stats)],
    part,
    client,
    remark: "one-conflict-batch",
    storageRoot,
    dependencies: trackedDependencies("one-conflict", stats, beforeVersionCreateAttempt)
  });
  assert.equal(oneConflict.inserted.length, 1);
});

test("20. 一次 P2002 后执行第二次数据库创建", () => {
  assert.deepEqual(oneConflict.stats.attempts, [1, 2]);
});

test("21. 第二次尝试重新读取 max 并分配新 version", () => {
  assert.deepEqual(oneConflict.planned, [[1], [2]]);
});

test("22. 一次冲突后第二次创建成功", () => {
  assert.equal(oneConflict.result.drawings[0].version, 2);
});

test("23. 一次冲突期间客户端文件只读取一次", () => {
  assert.equal(oneConflict.stats.arrayBuffer, 1);
});

test("24. 一次冲突期间 Sharp metadata 只验证一次", () => {
  assert.equal(oneConflict.stats.metadata, 1);
});

test("25. 一次冲突期间原图只写入一次", () => {
  assert.equal(oneConflict.stats.originalWrites, 1);
});

test("26. 一次冲突期间缩略图只生成一次", () => {
  assert.equal(oneConflict.stats.thumbnailWrites, 1);
});

test("27. 一次冲突期间 UUID 只生成一次", () => {
  assert.equal(oneConflict.stats.uuid, 1);
});

test("28. 重试成功后服务端文件名保持原 UUID", () => {
  assert.match(oneConflict.result.drawings[0].originalUrl, /one-conflict-uuid-1/);
});

test("29. 一次冲突成功后不存在重复版本", async () => {
  const duplicates = await client.$queryRawUnsafe(
    "SELECT version FROM PartDrawing WHERE partId = ? GROUP BY version HAVING COUNT(*) > 1",
    oneConflict.part.id
  );
  assert.deepEqual(duplicates, []);
});

test("30. 一次冲突成功后原图与缩略图均存在", async () => {
  const drawing = oneConflict.result.drawings[0];
  await access(path.join(storageRoot, drawing.originalUrl.replace("/uploads/drawings/", "")));
  await access(path.join(storageRoot, drawing.thumbnailUrl.replace("/uploads/drawings/", "")));
});

test("31. 前两次冲突均由第二 PrismaClient 插入", async () => {
  const part = await createPart("two-conflicts");
  const stats = newStats();
  twoConflicts = { part, stats, planned: [], inserted: [] };
  const beforeVersionCreateAttempt = async ({ attempt, versions }) => {
    stats.attempts.push(attempt);
    twoConflicts.planned.push([...versions]);
    if (attempt <= 2) {
      const created = await competitor.partDrawing.create({
        data: drawingData(part, versions[0], `two-conflicts-${attempt}`)
      });
      twoConflicts.inserted.push(created);
    }
  };
  twoConflicts.result = await uploadDrawingBatch({
    files: [
      trackedPng("two-conflicts-a.png", stats),
      trackedPng("two-conflicts-b.png", stats)
    ],
    part,
    client,
    remark: "two-conflicts-batch",
    storageRoot,
    dependencies: trackedDependencies("two-conflicts", stats, beforeVersionCreateAttempt)
  });
  assert.equal(twoConflicts.inserted.length, 2);
});

test("32. 两次真实 P2002 后数据库创建尝试总数为 3", () => {
  assert.deepEqual(twoConflicts.stats.attempts, [1, 2, 3]);
});

test("33. 第三次重新读取最大 version", () => {
  assert.deepEqual(twoConflicts.planned.map((versions) => versions[0]), [1, 2, 3]);
});

test("34. 第三次尝试成功", () => {
  assert.equal(twoConflicts.result.drawings.length, 2);
});

test("35. 第三次成功版本连续为 3、4", () => {
  assert.deepEqual(twoConflicts.result.drawings.map((drawing) => drawing.version), [3, 4]);
});

test("36. 两次冲突期间每个文件只读取一次", () => {
  assert.equal(twoConflicts.stats.arrayBuffer, 2);
});

test("37. 两次冲突期间每个文件只执行一次 Sharp metadata", () => {
  assert.equal(twoConflicts.stats.metadata, 2);
});

test("38. 两次冲突期间每个原图只写入一次", () => {
  assert.equal(twoConflicts.stats.originalWrites, 2);
});

test("39. 两次冲突期间每个缩略图只生成一次", () => {
  assert.equal(twoConflicts.stats.thumbnailWrites, 2);
});

test("40. 两次冲突期间每个 UUID 只生成一次", () => {
  assert.equal(twoConflicts.stats.uuid, 2);
});

test("41. 版本 P2002 重试不重写预先规划的 isMain", () => {
  assert.deepEqual(twoConflicts.result.drawings.map((drawing) => drawing.isMain), [true, false]);
});

test("42. 三次冲突均由第二 PrismaClient 真实制造", async () => {
  const part = await createPart("exhausted");
  const stats = newStats();
  const existingPath = path.join(originals, "existing-file.keep");
  await writeFile(existingPath, "keep");
  exhausted = { part, stats, inserted: [], existingPath, beforeFiles: await countFiles(storageRoot) };
  const beforeVersionCreateAttempt = async ({ attempt, versions }) => {
    stats.attempts.push(attempt);
    const created = await competitor.partDrawing.create({
      data: drawingData(part, versions[0], `exhausted-${attempt}`)
    });
    exhausted.inserted.push(created);
  };
  try {
    await uploadDrawingBatch({
      files: [
        trackedPng("exhausted-a.png", stats),
        trackedPng("exhausted-b.png", stats)
      ],
      part,
      client,
      remark: "exhausted-batch",
      storageRoot,
      dependencies: trackedDependencies("exhausted", stats, beforeVersionCreateAttempt)
    });
  } catch (error) {
    exhausted.error = error;
  }
  assert.equal(exhausted.inserted.length, 3);
});

test("43. 第三次 P2002 后不执行第四次", () => {
  assert.deepEqual(exhausted.stats.attempts, [1, 2, 3]);
});

test("44. 三次冲突耗尽返回 DrawingUploadError", () => {
  assert.ok(exhausted.error instanceof DrawingUploadError);
});

test("45. 三次冲突耗尽状态码为 409", () => {
  assert.equal(exhausted.error.status, 409);
});

test("46. 三次冲突耗尽返回精确稳定文案", () => {
  assert.equal(exhausted.error.message, "图纸版本冲突，请重新上传。");
});

test("47. 409 不泄露 P2002 原始信息", () => {
  assert.doesNotMatch(exhausted.error.message, /P2002|Prisma|constraint/i);
});

test("48. 409 不泄露临时绝对路径", () => {
  assert.equal(exhausted.error.message.includes(temporaryRoot), false);
});

test("49. 冲突耗尽后本批数据库记录不存在", async () => {
  const count = await client.partDrawing.count({ where: { remark: "exhausted-batch" } });
  assert.equal(count, 0);
});

test("50. 冲突耗尽后本批原图全部清理", async () => {
  const files = await treeSummary(originals);
  assert.equal(files.some((item) => item.path.includes("exhausted-uuid")), false);
});

test("51. 冲突耗尽后本批缩略图全部清理", async () => {
  const files = await treeSummary(thumbnails);
  assert.equal(files.some((item) => item.path.includes("exhausted-uuid")), false);
});

test("52. 冲突 Client 创建的三条记录全部保留", async () => {
  const count = await client.partDrawing.count({
    where: { id: { in: exhausted.inserted.map((drawing) => drawing.id) } }
  });
  assert.equal(count, 3);
});

test("53. 冲突耗尽清理不会删除既有文件", async () => {
  assert.equal(await readFile(exhausted.existingPath, "utf8"), "keep");
});

test("54. 三次冲突期间文件处理仍各只执行一次", () => {
  assert.deepEqual(
    [
      exhausted.stats.arrayBuffer,
      exhausted.stats.metadata,
      exhausted.stats.originalWrites,
      exhausted.stats.thumbnailWrites,
      exhausted.stats.uuid
    ],
    [2, 2, 2, 2, 2]
  );
});

test("55. 真实 P2003 映射为部件不存在且不重试", async () => {
  const part = await createPart("p2003");
  const stats = newStats();
  const beforeFiles = await countFiles(storageRoot);
  foreignKeyFailure = { stats, beforeFiles };
  try {
    await uploadDrawingBatch({
      files: [trackedPng("p2003.png", stats)],
      part,
      client,
      remark: "p2003-batch",
      storageRoot,
      dependencies: trackedDependencies("p2003", stats, async ({ attempt }) => {
        stats.attempts.push(attempt);
        await competitor.productPart.delete({ where: { id: part.id } });
      })
    });
  } catch (error) {
    foreignKeyFailure.error = error;
  }
  assert.ok(foreignKeyFailure.error.cause instanceof Prisma.PrismaClientKnownRequestError);
  assert.equal(foreignKeyFailure.error.cause.code, "P2003");
  assert.equal(foreignKeyFailure.error.status, 404);
  assert.equal(foreignKeyFailure.error.message, "部件不存在。");
  assert.deepEqual(stats.attempts, [1]);
});

test("56. P2003 后清理本批文件", async () => {
  assert.equal(await countFiles(storageRoot), foreignKeyFailure.beforeFiles);
});

test("57. 非 P2002 事务失败返回保存图纸记录失败且不重试", async () => {
  const part = await createPart("unknown");
  const stats = newStats();
  const beforeFiles = await countFiles(storageRoot);
  const failingClient = {
    partDrawing: client.partDrawing,
    $transaction: async () => {
      throw new Error(`unknown database failure ${temporaryRoot}`);
    }
  };
  unknownFailure = { stats, beforeFiles };
  try {
    await uploadDrawingBatch({
      files: [trackedPng("unknown.png", stats)],
      part,
      client: failingClient,
      remark: "unknown-batch",
      storageRoot,
      dependencies: trackedDependencies("unknown", stats, async ({ attempt }) => {
        stats.attempts.push(attempt);
      })
    });
  } catch (error) {
    unknownFailure.error = error;
  }
  assert.ok(unknownFailure.error instanceof DrawingUploadError);
  assert.equal(unknownFailure.error.status, 500);
  assert.equal(unknownFailure.error.message, "保存图纸记录失败。");
  assert.deepEqual(stats.attempts, [1]);
});

test("58. 非 P2002 错误后清理本批文件", async () => {
  assert.equal(await countFiles(storageRoot), unknownFailure.beforeFiles);
});

test("59. 非 P2002 错误不泄露绝对路径", () => {
  assert.equal(unknownFailure.error.message.includes(temporaryRoot), false);
});

test("60. 版本冲突测试仍保持最多一个主图", () => {
  assert.equal(twoConflicts.result.drawings[0].isMain, true);
  assert.equal(twoConflicts.inserted.every((drawing) => drawing.isMain === false), true);
});

test("61. 同一部件允许零主图", async () => {
  const part = await createPart("zero-main");
  await seedVersion(part, 1);
  await seedVersion(part, 2);
  assert.equal(await client.partDrawing.count({ where: { partId: part.id, isMain: true } }), 0);
});

test("62. 同一部件允许多条非主图", async () => {
  const rows = await client.$queryRawUnsafe(
    "SELECT partId FROM PartDrawing WHERE isMain = 0 GROUP BY partId HAVING COUNT(*) >= 2 LIMIT 1"
  );
  assert.equal(rows.length, 1);
});

test("63. 第二条同部件主图真实触发 P2002", async () => {
  directMainPart = await createPart("direct-main");
  await client.partDrawing.create({ data: { ...drawingData(directMainPart, 1, "direct-main-a"), isMain: true } });
  try {
    await competitor.partDrawing.create({ data: { ...drawingData(directMainPart, 2, "direct-main-b"), isMain: true } });
  } catch (error) {
    directMainConflict = error;
  }
  assert.ok(directMainConflict instanceof Prisma.PrismaClientKnownRequestError);
  assert.equal(directMainConflict.code, "P2002");
});

test("64. 不同部件允许各有一条主图", async () => {
  const part = await createPart("other-main");
  const drawing = await client.partDrawing.create({ data: { ...drawingData(part, 1, "other-main"), isMain: true } });
  assert.equal(drawing.isMain, true);
});

test("65. 两个首次上传请求都在数据库仍为空时规划主图", async () => {
  const part = await createPart("first-upload-race");
  const loserReached = deferred();
  const releaseLoser = deferred();
  const loserStats = newStats();
  const winnerStats = newStats();
  const loserPromise = uploadDrawingBatch({
    files: [trackedPng("first-loser.png", loserStats)],
    part,
    client,
    remark: "first-upload-loser",
    storageRoot,
    dependencies: trackedDependencies("first-loser", loserStats, async ({ attempt }) => {
      loserStats.attempts.push(attempt);
      if (attempt === 1) {
        loserReached.resolve();
        await releaseLoser.promise;
      }
    })
  });
  await loserReached.promise;
  const winner = await uploadDrawingBatch({
    files: [trackedPng("first-winner.png", winnerStats)],
    part,
    client: competitor,
    remark: "first-upload-winner",
    storageRoot,
    dependencies: trackedDependencies("first-winner", winnerStats, async ({ attempt }) => {
      winnerStats.attempts.push(attempt);
    })
  });
  releaseLoser.resolve();
  const loser = await loserPromise;
  firstUploadRace = { part, loser, winner, loserStats, winnerStats };
  assert.equal(winner.drawings[0].isMain, true);
  assert.deepEqual(loserStats.attempts, [1, 2]);
});

test("66. 后到数据库创建的首次上传批次降级为非主图", () => {
  assert.equal(firstUploadRace.loser.drawings[0].isMain, false);
});

test("67. 两个首次上传批次的记录全部保留", async () => {
  assert.equal(await client.partDrawing.count({ where: { partId: firstUploadRace.part.id } }), 2);
});

test("68. 首次上传竞争后主图数量精确为一", async () => {
  assert.equal(await client.partDrawing.count({ where: { partId: firstUploadRace.part.id, isMain: true } }), 1);
});

test("69. 首次上传竞争后版本唯一且连续", async () => {
  const rows = await client.partDrawing.findMany({
    where: { partId: firstUploadRace.part.id },
    orderBy: { version: "asc" },
    select: { version: true }
  });
  assert.deepEqual(rows.map((row) => row.version), [1, 2]);
});

test("70. 降级批次重新查询最大版本后成功", () => {
  assert.equal(firstUploadRace.loser.drawings[0].version, 2);
});

test("71. 降级批次文件读取和 Sharp 校验只执行一次", () => {
  assert.equal(firstUploadRace.loserStats.arrayBuffer, 1);
  assert.equal(firstUploadRace.loserStats.metadata, 1);
});

test("72. 降级批次原图、缩略图和 UUID 只生成一次", () => {
  assert.equal(firstUploadRace.loserStats.originalWrites, 1);
  assert.equal(firstUploadRace.loserStats.thumbnailWrites, 1);
  assert.equal(firstUploadRace.loserStats.uuid, 1);
});

test("73. 首次上传竞争两批文件全部保留且无孤儿", async () => {
  for (const drawing of [...firstUploadRace.winner.drawings, ...firstUploadRace.loser.drawings]) {
    await access(path.join(storageRoot, drawing.originalUrl.replace("/uploads/drawings/", "")));
    await access(path.join(storageRoot, drawing.thumbnailUrl.replace("/uploads/drawings/", "")));
  }
});

test("74. 先版本冲突再主图冲突最终成功", async () => {
  const part = await createPart("version-then-main");
  const stats = newStats();
  versionThenMain = { part, stats };
  versionThenMain.result = await uploadDrawingBatch({
    files: [trackedPng("version-then-main.png", stats)],
    part,
    client,
    remark: "version-then-main",
    storageRoot,
    dependencies: trackedDependencies("version-then-main", stats, async ({ attempt, versions }) => {
      stats.attempts.push(attempt);
      if (attempt === 1) {
        await competitor.partDrawing.create({ data: drawingData(part, versions[0], "version-first") });
      } else if (attempt === 2) {
        await competitor.partDrawing.create({ data: { ...drawingData(part, versions[0], "main-second"), isMain: true } });
      }
    })
  });
  assert.equal(versionThenMain.result.drawings[0].isMain, false);
});

test("75. 先版本再主图冲突使用三次数据库尝试", () => {
  assert.deepEqual(versionThenMain.stats.attempts, [1, 2, 3]);
});

test("76. 先主图冲突再版本冲突最终成功", async () => {
  const part = await createPart("main-then-version");
  const stats = newStats();
  mainThenVersion = { part, stats };
  mainThenVersion.result = await uploadDrawingBatch({
    files: [trackedPng("main-then-version.png", stats)],
    part,
    client,
    remark: "main-then-version",
    storageRoot,
    dependencies: trackedDependencies("main-then-version", stats, async ({ attempt, versions }) => {
      stats.attempts.push(attempt);
      if (attempt === 1) {
        await competitor.partDrawing.create({ data: { ...drawingData(part, versions[0], "main-first"), isMain: true } });
      } else if (attempt === 2) {
        await competitor.partDrawing.create({ data: drawingData(part, versions[0], "version-second") });
      }
    })
  });
  assert.equal(mainThenVersion.result.drawings[0].isMain, false);
});

test("77. 先主图再版本冲突使用三次数据库尝试", () => {
  assert.deepEqual(mainThenVersion.stats.attempts, [1, 2, 3]);
});

test("78. 两次版本冲突加一次主图降级后仍成功", async () => {
  const part = await createPart("two-version-main");
  const stats = newStats();
  twoVersionsThenMain = { part, stats };
  twoVersionsThenMain.result = await uploadDrawingBatch({
    files: [trackedPng("two-version-main.png", stats)],
    part,
    client,
    remark: "two-version-main",
    storageRoot,
    dependencies: trackedDependencies("two-version-main", stats, async ({ attempt, versions }) => {
      stats.attempts.push(attempt);
      if (attempt <= 2) {
        await competitor.partDrawing.create({ data: drawingData(part, versions[0], `version-${attempt}`) });
      } else if (attempt === 3) {
        await competitor.partDrawing.create({ data: { ...drawingData(part, versions[0], "main-third"), isMain: true } });
      }
    })
  });
  assert.equal(twoVersionsThenMain.result.drawings[0].version, 4);
});

test("79. 一次主图降级不占用两次版本冲突额度", () => {
  assert.deepEqual(twoVersionsThenMain.stats.attempts, [1, 2, 3, 4]);
});

test("80. 混合冲突期间文件处理仍全部只执行一次", () => {
  for (const scenario of [versionThenMain, mainThenVersion, twoVersionsThenMain]) {
    assert.deepEqual(
      [scenario.stats.arrayBuffer, scenario.stats.metadata, scenario.stats.originalWrites, scenario.stats.thumbnailWrites, scenario.stats.uuid],
      [1, 1, 1, 1, 1]
    );
  }
});

test("81. 主图切换最大尝试次数为三", () => {
  assert.equal(MAX_MAIN_SWITCH_ATTEMPTS, 3);
});

test("82. 主图切换不存在目标稳定返回 404", async () => {
  let attempts = 0;
  try {
    await setMainDrawing({
      drawingId: "missing-drawing",
      client,
      dependencies: { beforeAttempt: async () => { attempts += 1; } }
    });
  } catch (error) {
    missingMainError = error;
  }
  assert.ok(missingMainError instanceof DrawingMainError);
  assert.equal(missingMainError.status, 404);
  assert.equal(missingMainError.message, "图纸不存在。");
  assert.equal(attempts, 1);
});

test("83. OBSOLETE 图纸不能设为主图且不重试", async () => {
  const part = await createPart("obsolete-main");
  const drawing = await seedVersion(part, 1, "OBSOLETE", "obsolete-main");
  let attempts = 0;
  try {
    await setMainDrawing({
      drawingId: drawing.id,
      client,
      dependencies: { beforeAttempt: async () => { attempts += 1; } }
    });
  } catch (error) {
    obsoleteMainError = error;
  }
  assert.equal(obsoleteMainError.status, 400);
  assert.equal(obsoleteMainError.message, "已作废图纸不能设为主图。");
  assert.equal(attempts, 1);
});

test("84. 顺序切换不同主图后最后成功目标获胜", async () => {
  const part = await createPart("main-switch");
  const first = await client.partDrawing.create({ data: { ...drawingData(part, 1, "switch-first"), isMain: true } });
  const second = await seedVersion(part, 2, "PENDING", "switch-second");
  const before = [first, second].map(({ version, status, originalUrl }) => ({ version, status, originalUrl }));
  await setMainDrawing({ drawingId: first.id, client });
  const result = await setMainDrawing({ drawingId: second.id, client: competitor });
  mainSwitch = { part, first, second, before, result };
  assert.equal(result.id, second.id);
});

test("85. 主图切换最终精确一条主图且其他图纸为 false", async () => {
  const rows = await client.partDrawing.findMany({ where: { partId: mainSwitch.part.id }, orderBy: { version: "asc" } });
  assert.equal(rows.filter((row) => row.isMain).length, 1);
  assert.equal(rows[0].isMain, false);
  assert.equal(rows[1].isMain, true);
});

test("86. 主图切换不改变 version、status 和文件 URL", async () => {
  const rows = await client.partDrawing.findMany({ where: { partId: mainSwitch.part.id }, orderBy: { version: "asc" } });
  assert.deepEqual(rows.map(({ version, status, originalUrl }) => ({ version, status, originalUrl })), mainSwitch.before);
});

test("87. 真实主图 P2002 由服务映射为 409 且只尝试一次", async () => {
  let attempts = 0;
  const throwingClient = {
    $transaction: async () => {
      throw directMainConflict;
    }
  };
  try {
    await setMainDrawing({
      drawingId: "real-p2002",
      client: throwingClient,
      dependencies: { beforeAttempt: async () => { attempts += 1; } }
    });
  } catch (error) {
    mappedMainConflict = { error, attempts };
  }
  assert.equal(mappedMainConflict.error.status, 409);
  assert.equal(mappedMainConflict.error.message, "主图切换冲突，请重试。");
  assert.equal(mappedMainConflict.attempts, 1);
});

test("88. 主图 409 不泄露索引名或原始数据库错误", () => {
  assert.doesNotMatch(mappedMainConflict.error.message, /PartDrawing_partId_main_key|P2002|Prisma|SQLite/i);
});

test("89. 作废当前主图后允许持久零主图且不自动补选", async () => {
  const part = await createPart("obsolete-zero");
  const main = await client.partDrawing.create({ data: { ...drawingData(part, 1, "obsolete-zero-main"), isMain: true } });
  await seedVersion(part, 2, "PENDING", "obsolete-zero-other");
  await client.partDrawing.update({ where: { id: main.id }, data: { status: "OBSOLETE", isMain: false } });
  const rows = await client.partDrawing.findMany({ where: { partId: part.id } });
  assert.equal(rows.filter((row) => row.isMain).length, 0);
});

test("90. 跨 partId 主图切换互不影响", async () => {
  const otherMainBefore = await client.partDrawing.findUnique({ where: { id: mainSwitch.second.id } });
  await setMainDrawing({ drawingId: directOtherPart ? (await client.partDrawing.findFirst({ where: { partId: directOtherPart.id } })).id : mainSwitch.first.id, client });
  const otherMainAfter = await client.partDrawing.findUnique({ where: { id: mainSwitch.second.id } });
  assert.equal(otherMainAfter.isMain, otherMainBefore.isMain);
});

test("91. 独立 PrismaClient 持有真实 SQLite 写锁", async () => {
  const locker = new PrismaClient({ datasourceUrl: databaseUrl });
  const blocked = new PrismaClient({ datasourceUrl: databaseUrl });
  clients.push(locker, blocked);
  await blocked.$queryRawUnsafe("PRAGMA busy_timeout = 1");
  const part = await createPart("lock-exhausted");
  const first = await client.partDrawing.create({ data: { ...drawingData(part, 1, "lock-first"), isMain: true } });
  const second = await seedVersion(part, 2, "PENDING", "lock-second");
  const locked = deferred();
  const release = deferred();
  const lockPromise = locker.$transaction(async (transaction) => {
    await transaction.partDrawing.updateMany({ where: { partId: part.id }, data: { remark: "write-lock" } });
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  const attempts = [];
  let error;
  try {
    await setMainDrawing({
      drawingId: second.id,
      client: blocked,
      dependencies: {
        beforeAttempt: async (attempt) => { attempts.push(attempt); },
        sleep: async () => {}
      }
    });
  } catch (caught) {
    error = caught;
  } finally {
    release.resolve();
    await lockPromise;
  }
  lockExhausted = { part, first, second, attempts, error };
  assert.ok(error);
});

test("92. 真实 SQLite 写锁精确进行三次事务尝试", () => {
  assert.deepEqual(lockExhausted.attempts, [1, 2, 3]);
});

test("93. 第三次锁冲突耗尽稳定返回 503", () => {
  assert.ok(lockExhausted.error instanceof DrawingMainError);
  assert.equal(lockExhausted.error.status, 503);
  assert.equal(lockExhausted.error.message, "主图切换繁忙，请稍后重试。");
});

test("94. 锁冲突 503 不泄露 SQLite 错误文本", () => {
  assert.doesNotMatch(lockExhausted.error.message, /SQLITE|locked|Prisma|P\d{4}/i);
});

test("95. 锁冲突耗尽后数据库仍精确一个主图", async () => {
  assert.equal(await client.partDrawing.count({ where: { partId: lockExhausted.part.id, isMain: true } }), 1);
});

test("96. 两个独立 Client 并发切换不同主图并确定性交错", async () => {
  const firstClient = new PrismaClient({ datasourceUrl: databaseUrl });
  const lastClient = new PrismaClient({ datasourceUrl: databaseUrl });
  clients.push(firstClient, lastClient);
  await lastClient.$queryRawUnsafe("PRAGMA busy_timeout = 1");
  const part = await createPart("concurrent-main-switch");
  const firstTarget = await client.partDrawing.create({ data: { ...drawingData(part, 1, "concurrent-first"), isMain: true } });
  const lastTarget = await seedVersion(part, 2, "PENDING", "concurrent-last");
  const before = await client.partDrawing.findMany({
    where: { partId: part.id },
    orderBy: { version: "asc" },
    select: { version: true, status: true, originalUrl: true }
  });
  const locked = deferred();
  const release = deferred();
  const pausingClient = {
    $transaction: (callback) => firstClient.$transaction((transaction) => callback({
      partDrawing: {
        findUnique: (args) => transaction.partDrawing.findUnique(args),
        updateMany: async (args) => {
          const result = await transaction.partDrawing.updateMany(args);
          locked.resolve();
          await release.promise;
          return result;
        },
        update: (args) => transaction.partDrawing.update(args)
      }
    }))
  };
  const firstPromise = setMainDrawing({ drawingId: firstTarget.id, client: pausingClient });
  await locked.promise;
  const attempts = [];
  let released = false;
  const lastPromise = setMainDrawing({
    drawingId: lastTarget.id,
    client: lastClient,
    dependencies: {
      beforeAttempt: async (attempt) => { attempts.push(attempt); },
      sleep: async () => {
        if (!released) {
          released = true;
          release.resolve();
          await firstPromise;
        }
      }
    }
  });
  try {
    await lastPromise;
  } finally {
    release.resolve();
    await firstPromise;
  }
  mainSwitch = { part, firstTarget, lastTarget, attempts, before };
  assert.ok(attempts.length >= 2);
});

test("97. 并发切换至少一次真实遭遇锁冲突后重试成功", () => {
  assert.deepEqual(mainSwitch.attempts, [1, 2]);
});

test("98. 并发切换最后成功提交目标成为唯一主图", async () => {
  const rows = await client.partDrawing.findMany({ where: { partId: mainSwitch.part.id }, orderBy: { version: "asc" } });
  assert.equal(rows.filter((row) => row.isMain).length, 1);
  assert.equal(rows.find((row) => row.isMain).id, mainSwitch.lastTarget.id);
});

test("99. 并发切换其他图纸为非主图", async () => {
  const first = await client.partDrawing.findUnique({ where: { id: mainSwitch.firstTarget.id } });
  assert.equal(first.isMain, false);
});

test("100. 并发切换不改变版本、状态和文件 URL", async () => {
  const afterRows = await client.partDrawing.findMany({
    where: { partId: mainSwitch.part.id },
    orderBy: { version: "asc" },
    select: { version: true, status: true, originalUrl: true }
  });
  assert.deepEqual(afterRows, mainSwitch.before);
});

test("101. 正式 dev.db 在并发测试期间 SHA-256 保持不变", async () => {
  assert.equal(await hashFile(formalDb), formalDbHash);
});

test("102. 正式 private 文件树在并发测试期间保持不变", async () => {
  assert.deepEqual(await treeSummary(privateRoot), privateTreeBefore);
});

test("103. 正式 public 文件树在并发测试期间保持不变", async () => {
  assert.deepEqual(await treeSummary(publicRoot), publicTreeBefore);
});

test("104. 全部 PrismaClient、临时数据库、sidecar 和存储目录最终清理", async () => {
  await Promise.all(clients.map((item) => item.$disconnect()));
  await rm(temporaryRoot, { recursive: true, force: true });
  await assert.rejects(access(temporaryRoot), (error) => error?.code === "ENOENT");
  assert.equal(await hashFile(formalDb), formalDbHash);
  assert.deepEqual(await treeSummary(privateRoot), privateTreeBefore);
  assert.deepEqual(await treeSummary(publicRoot), publicTreeBefore);
  cleaned = true;
});
