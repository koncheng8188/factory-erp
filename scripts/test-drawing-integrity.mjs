import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { MAX_DRAWING_FILE_COUNT, MAX_DRAWING_FILE_SIZE, MAX_DRAWING_REQUEST_SIZE, DrawingUploadError, deleteSavedDrawingFiles, prevalidateDrawingFiles, uploadDrawingBatch } from "../src/lib/drawing-upload-integrity.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const formalDb = path.join(root, "prisma", "dev.db");
const temporaryRoot = path.join(tmpdir(), `jinhong-erp-drawing-${process.pid}-${randomUUID()}`);
const databasePath = path.join(temporaryRoot, "drawing.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
const storageRoot = path.join(temporaryRoot, "storage");
const clients = [];
let client;
let part;
let order;
let product;
let formalHash;

let png;
let jpeg;
let webp;
const pdf = Buffer.from("%PDF-1.4\n%test\n", "ascii");
function file(name, type, buffer = png, size = buffer.length) { return { name, type, size, arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }; }
async function hash(value) { return createHash("sha256").update(await readFile(value)).digest("hex"); }
async function countFiles(directory) { try { return (await readdir(directory, { recursive: true })).length; } catch { return 0; } }

before(async () => {
  formalHash = await hash(formalDb);
  png = await sharp({ create: { width: 1, height: 1, channels: 4, background: "#ffffff" } }).png().toBuffer();
  jpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
  webp = await sharp({ create: { width: 1, height: 1, channels: 4, background: "#ffffff" } }).webp().toBuffer();
  await mkdir(temporaryRoot, { recursive: false });
  await writeFile(databasePath, "");
  const command = process.platform === "win32" ? "npx.cmd prisma migrate deploy --schema prisma/schema.prisma" : "npx prisma migrate deploy --schema prisma/schema.prisma";
  const migration = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", env: { ...process.env, DATABASE_URL: databaseUrl } });
  assert.equal(migration.status, 0, migration.stderr);
  client = new PrismaClient({ datasourceUrl: databaseUrl }); clients.push(client);
  const customer = await client.customer.create({ data: { name: "图纸完整性测试" } });
  order = await client.order.create({ data: { orderNo: `DRAW-${randomUUID()}`, customerId: customer.id, customerName: customer.name, status: "PENDING" } });
  product = await client.product.create({ data: { orderId: order.id, productName: "测试产品", quantity: 1, status: "PENDING" } });
  part = await client.productPart.create({ data: { orderId: order.id, productId: product.id, partName: "测试部件", unitQuantity: 1, productQuantity: 1, totalQuantity: 1, status: "PENDING" } });
});

after(async () => {
  await Promise.all(clients.map((item) => item.$disconnect()));
  assert.equal(await hash(formalDb), formalHash, "正式 dev.db 发生变化");
  await rm(temporaryRoot, { recursive: true, force: true });
  await assert.rejects(access(temporaryRoot), (error) => error?.code === "ENOENT");
});

test("有效 PNG、PDF 通过三重预验证", async () => {
  const result = await prevalidateDrawingFiles([file("a.PNG", "image/png"), file("b.pdf", "application/pdf", pdf)]);
  assert.deepEqual(result.map((item) => item.fileType), ["png", "pdf"]);
});
test("扩展名、MIME、签名、空文件与损坏图片拒绝", async () => {
  for (const input of [file("a.jpg", "image/png"), file("a.png", "image/png", Buffer.from("bad")), file("a.svg", "image/svg+xml"), file("a.png", "image/png", png, 0)]) await assert.rejects(prevalidateDrawingFiles([input]), DrawingUploadError);
});
test("数量和大小边界在读取文件前拒绝", async () => {
  await assert.rejects(prevalidateDrawingFiles(Array.from({ length: MAX_DRAWING_FILE_COUNT + 1 }, () => file("a.png", "image/png"))), /20/);
  await assert.rejects(prevalidateDrawingFiles([file("a.png", "image/png", png, MAX_DRAWING_FILE_SIZE + 1)]), /50 MB/);
  await assert.rejects(prevalidateDrawingFiles(Array.from({ length: 6 }, () => file("a.png", "image/png", png, Math.floor(MAX_DRAWING_REQUEST_SIZE / 5) + 1))), /200 MB/);
});
test("正常图片与 PDF 写入临时私有存储并创建记录", async () => {
  const result = await uploadDrawingBatch({ files: [file("same.png", "image/png"), file("same.pdf", "application/pdf", pdf)], part, client, remark: null, storageRoot });
  assert.equal(result.drawings.length, 2);
  assert.equal(result.drawings.filter((item) => item.uploadStatus === "SUCCESS").length, 2);
  assert.ok(await countFiles(storageRoot) >= 3);
});
test("缩略图失败降级保留原图与记录", async () => {
  const result = await uploadDrawingBatch({ files: [file("fallback.png", "image/png")], part, client, remark: null, storageRoot, dependencies: { createThumbnail: async () => { throw new Error("sharp detail"); } } });
  const drawing = result.drawings[0];
  assert.equal(drawing.uploadStatus, "THUMBNAIL_FAILED");
  assert.equal(drawing.errorMessage, "缩略图生成失败。");
  assert.equal(drawing.thumbnailUrl, null);
});
test("数据库失败清理本批文件且不暴露路径", async () => {
  const badClient = { ...client, $transaction: async () => { throw new Error("database / secret path"); } };
  await assert.rejects(uploadDrawingBatch({ files: [file("rollback.png", "image/png")], part, client: badClient, remark: null, storageRoot }), (error) => error instanceof DrawingUploadError && error.message === "保存图纸记录失败。");
});

test("JPEG、PNG、WEBP、PDF 的有效扩展名、MIME 和签名均通过", async () => {
  const prepared = await prevalidateDrawingFiles([
    file("a.jpeg", "image/jpeg", jpeg), file("b.png", "image/png", png),
    file("c.webp", "image/webp", webp), file("d.pdf", "application/pdf", pdf)
  ]);
  assert.deepEqual(prepared.map((item) => item.fileType), ["jpg", "png", "webp", "pdf"]);
});

test("每一种文件签名错误和伪装 SVG、HTML 都被拒绝", async () => {
  for (const input of [
    file("a.jpg", "image/jpeg", Buffer.from([0, 1, 2])), file("a.png", "image/png", Buffer.from([0, 1, 2])),
    file("a.webp", "image/webp", Buffer.from("RIFFxxxxNOPE")), file("a.pdf", "application/pdf", Buffer.from("not-pdf")),
    file("a.svg", "image/svg+xml", Buffer.from("<svg/>")), file("a.png", "image/png", Buffer.from("<html/>"))
  ]) await assert.rejects(prevalidateDrawingFiles([input]), DrawingUploadError);
});

test("20 个和精确 50 MiB、200 MiB 边界允许", async () => {
  const twenty = Array.from({ length: MAX_DRAWING_FILE_COUNT }, (_, index) => file(`${index}.png`, "image/png"));
  assert.equal((await prevalidateDrawingFiles(twenty)).length, 20);
  assert.equal((await prevalidateDrawingFiles([file("50.png", "image/png", png, MAX_DRAWING_FILE_SIZE)])).length, 1);
  assert.equal((await prevalidateDrawingFiles(Array.from({ length: 4 }, (_, index) => file(`${index}.png`, "image/png", png, MAX_DRAWING_REQUEST_SIZE / 4)))).length, 4);
});

test("超限在 arrayBuffer、Sharp、写文件和 Prisma 前拒绝", async () => {
  let reads = 0;
  const oversized = { ...file("large.png", "image/png", png, MAX_DRAWING_FILE_SIZE + 1), arrayBuffer: async () => { reads += 1; return png; } };
  await assert.rejects(prevalidateDrawingFiles([oversized]), DrawingUploadError);
  assert.equal(reads, 0);
});

test("图片和 PDF 保存的 URL、磁盘文件、状态与响应记录一致", async () => {
  const result = await uploadDrawingBatch({ files: [file("normal.jpg", "image/jpeg", jpeg), file("normal.pdf", "application/pdf", pdf)], part, client, remark: "正常", storageRoot });
  const [image, document] = result.drawings;
  assert.equal(image.uploadStatus, "SUCCESS");
  assert.match(image.originalUrl, /^\/uploads\/drawings\/originals\//);
  assert.match(image.thumbnailUrl, /^\/uploads\/drawings\/thumbnails\//);
  assert.equal(document.uploadStatus, "SUCCESS");
  assert.equal(document.thumbnailUrl, null);
  assert.notEqual(document.uploadStatus, "THUMBNAIL_FAILED");
  await access(path.join(storageRoot, image.originalUrl.replace("/uploads/drawings/", "")));
  await access(path.join(storageRoot, image.thumbnailUrl.replace("/uploads/drawings/", "")));
  await access(path.join(storageRoot, document.originalUrl.replace("/uploads/drawings/", "")));
});

test("缩略图失败只降级该文件，同批其他文件与整批请求仍成功", async () => {
  let calls = 0;
  const result = await uploadDrawingBatch({ files: [file("failed.png", "image/png"), file("ok.pdf", "application/pdf", pdf)], part, client, remark: null, storageRoot, dependencies: { createThumbnail: async () => { calls += 1; throw new Error("sharp / private/path"); } } });
  assert.equal(calls, 1);
  assert.equal(result.drawings[0].uploadStatus, "THUMBNAIL_FAILED");
  assert.equal(result.drawings[0].errorMessage, "缩略图生成失败。");
  assert.equal(result.drawings[0].thumbnailUrl, null);
  assert.equal(result.drawings[1].uploadStatus, "SUCCESS");
});

test("原图写入失败清理此前本批文件且不写入数据库或泄露路径", async () => {
  const beforeFiles = await countFiles(storageRoot);
  const beforeRecords = await client.partDrawing.count({ where: { partId: part.id } });
  let writes = 0;
  await assert.rejects(uploadDrawingBatch({ files: [file("first.png", "image/png"), file("second.png", "image/png")], part, client, remark: null, storageRoot, dependencies: { writeOriginal: async (target, buffer) => { writes += 1; if (writes === 2) throw new Error(`disk ${target}`); await writeFile(target, buffer, { flag: "wx" }); } } }), (error) => error instanceof DrawingUploadError && error.message === "保存图纸文件失败。" && !error.message.includes(temporaryRoot));
  assert.equal(await countFiles(storageRoot), beforeFiles);
  assert.equal(await client.partDrawing.count({ where: { partId: part.id } }), beforeRecords);
});

test("事务失败清理原图与缩略图，保留既有文件且不创建本批记录", async () => {
  const beforeFiles = await countFiles(storageRoot);
  const beforeRecords = await client.partDrawing.count({ where: { partId: part.id } });
  const badClient = { ...client, $transaction: async () => { throw new Error("transaction absolute/path"); } };
  await assert.rejects(uploadDrawingBatch({ files: [file("db.png", "image/png")], part, client: badClient, remark: null, storageRoot }), (error) => error instanceof DrawingUploadError && error.message === "保存图纸记录失败。" && !error.message.includes(temporaryRoot));
  assert.equal(await countFiles(storageRoot), beforeFiles);
  assert.equal(await client.partDrawing.count({ where: { partId: part.id } }), beforeRecords);
});

test("同名、同毫秒上传仍以 UUID 生成不同且无客户端路径的服务端文件名", async () => {
  const ids = ["uuid-a", "uuid-b"];
  const result = await uploadDrawingBatch({ files: [file("../../same.png", "image/png"), file("../../same.png", "image/png")], part, client, remark: null, storageRoot, dependencies: { now: () => 1000, randomId: () => ids.shift() } });
  assert.notEqual(result.drawings[0].originalUrl, result.drawings[1].originalUrl);
  for (const drawing of result.drawings) {
    assert.doesNotMatch(drawing.originalUrl, /\.\.|same\.png/);
    assert.match(path.basename(drawing.originalUrl), new RegExp(`${part.id.replace(/[^A-Za-z0-9_-]+/g, "-")}_1000_uuid-`));
  }
});

test("清理拒绝存储根目录外的伪造路径", async () => {
  const outside = path.join(temporaryRoot, "outside.txt");
  await writeFile(outside, "keep");
  await deleteSavedDrawingFiles([{ createdPaths: [outside] }], storageRoot);
  assert.equal(await readFile(outside, "utf8"), "keep");
});

test("父部件在读取后被另一 PrismaClient 删除时真实 P2003、404 与文件清理", async () => {
  const racePart = await client.productPart.create({ data: { orderId: order.id, productId: product.id, partName: "竞态部件", unitQuantity: 1, productQuantity: 1, totalQuantity: 1, status: "PENDING" } });
  const second = new PrismaClient({ datasourceUrl: databaseUrl }); clients.push(second);
  let deleted = false;
  const racingClient = { ...client, $transaction: async (operations) => { await second.productPart.delete({ where: { id: racePart.id } }); deleted = true; return client.$transaction(operations); } };
  const beforeFiles = await countFiles(storageRoot);
  await assert.rejects(uploadDrawingBatch({ files: [file("race.png", "image/png")], part: racePart, client: racingClient, remark: null, storageRoot }), (error) => error instanceof DrawingUploadError && error.status === 404 && error.message === "部件不存在。" && error.cause?.code === "P2003");
  assert.equal(deleted, true);
  assert.equal(await countFiles(storageRoot), beforeFiles);
});
