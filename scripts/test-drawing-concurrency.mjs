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

test("04. 本阶段没有创建主图部分唯一索引", async () => {
  const rows = await client.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND sql LIKE '%isMain%' AND sql LIKE '%UNIQUE%'"
  );
  assert.deepEqual(rows, []);
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

test("60. 主图竞争不在本阶段承诺数量小于等于一", () => {
  assert.equal(twoConflicts.result.drawings[0].isMain, true);
  assert.equal(twoConflicts.inserted.every((drawing) => drawing.isMain === false), true);
});

test("61. 正式 dev.db 在并发测试期间 SHA-256 保持不变", async () => {
  assert.equal(await hashFile(formalDb), formalDbHash);
});

test("62. 正式 private 文件树在并发测试期间保持不变", async () => {
  assert.deepEqual(await treeSummary(privateRoot), privateTreeBefore);
});

test("63. 正式 public 文件树在并发测试期间保持不变", async () => {
  assert.deepEqual(await treeSummary(publicRoot), publicTreeBefore);
});

test("64. 全部 PrismaClient、临时数据库、sidecar 和存储目录最终清理", async () => {
  await Promise.all(clients.map((item) => item.$disconnect()));
  await rm(temporaryRoot, { recursive: true, force: true });
  await assert.rejects(access(temporaryRoot), (error) => error?.code === "ENOENT");
  assert.equal(await hashFile(formalDb), formalDbHash);
  assert.deepEqual(await treeSummary(privateRoot), privateTreeBefore);
  assert.deepEqual(await treeSummary(publicRoot), publicTreeBefore);
  cleaned = true;
});
