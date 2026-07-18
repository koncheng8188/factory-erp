import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readSource(...segments) {
  return readFile(path.join(root, ...segments), "utf8");
}

function functionBody(source, method) {
  const marker = `export async function ${method}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `缺少 ${method} handler`);

  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${method} handler 缺少函数体`);
  const bodyStart = signatureEnd + 2;

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }
  assert.fail(`${method} handler 函数体未闭合`);
}

function assertBefore(handler, first, second) {
  const firstIndex = handler.indexOf(first);
  const secondIndex = handler.indexOf(second);
  assert.notEqual(firstIndex, -1, `找不到 ${first}`);
  assert.notEqual(secondIndex, -1, `找不到 ${second}`);
  assert.ok(firstIndex < secondIndex, `${first} 必须早于 ${second}`);
}

function occurrenceCount(value, target) {
  return value.split(target).length - 1;
}

function assertAllPermissions(handler, permissions) {
  const pattern = permissions
    .map((permission) => `"${permission.replaceAll(".", "\\.")}"`)
    .join(",\\s*");
  assert.match(handler, new RegExp(`requireApiAllPermissions\\(\\[\\s*${pattern},?\\s*\\]\\)`));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceHash(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function sourceSlice(content, start, end) {
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `未找到 ${start}`);
  assert.notEqual(endIndex, -1, `未找到 ${end}`);
  return content.slice(startIndex, endIndex);
}

const source = {
  thumbnail: await readSource("src", "app", "api", "drawings", "[id]", "thumbnail", "route.ts"),
  file: await readSource("src", "app", "api", "drawings", "[id]", "file", "route.ts"),
  partsDrawings: await readSource("src", "app", "api", "parts", "[id]", "drawings", "route.ts"),
  drawingsPage: await readSource("src", "app", "(protected)", "drawings", "page.tsx"),
  printThumbnail: await readSource("src", "app", "api", "drawings", "[id]", "print-thumbnail", "route.ts"),
  drawingWrite: await readSource("src", "app", "api", "drawings", "[id]", "route.ts"),
  drawingMain: await readSource("src", "app", "api", "drawings", "[id]", "main", "route.ts"),
  fileAccess: await readSource("src", "lib", "drawing-file-access.ts"),
  delivery: await readSource("src", "app", "api", "delivery", "route.ts"),
  deliveryDetail: await readSource("src", "app", "api", "delivery", "[id]", "route.ts"),
  outsourcing: await readSource("src", "app", "api", "outsourcing", "route.ts"),
  returns: await readSource("src", "app", "api", "returns", "route.ts"),
  kitting: await readSource("src", "app", "api", "kitting", "[productId]", "route.ts"),
  partAdvance: await readSource("src", "app", "api", "parts", "[id]", "advance", "route.ts"),
  partAbnormal: await readSource("src", "app", "api", "parts", "[id]", "abnormal", "route.ts"),
  partAbnormalResolve: await readSource("src", "app", "api", "parts", "[id]", "abnormal", "resolve", "route.ts"),
  productionComplete: await readSource("src", "app", "api", "products", "[id]", "mark-production-complete", "route.ts"),
  productParts: await readSource("src", "app", "api", "products", "[id]", "parts", "route.ts"),
  backupList: await readSource("src", "app", "api", "system", "backup", "list", "route.ts"),
  backupCreate: await readSource("src", "app", "api", "system", "backup", "route.ts"),
  importTemplate: await readSource("src", "app", "api", "imports", "excel", "template", "route.ts"),
  simpleTemplate: await readSource("src", "app", "api", "imports", "excel", "simple-template", "route.ts"),
  orderImportTemplate: await readSource("src", "app", "api", "orders", "[id]", "import-products", "template", "route.ts"),
  customers: await readSource("src", "app", "api", "customers", "route.ts"),
  customerById: await readSource("src", "app", "api", "customers", "[id]", "route.ts"),
  orders: await readSource("src", "app", "api", "orders", "route.ts"),
  orderById: await readSource("src", "app", "api", "orders", "[id]", "route.ts"),
  orderProducts: await readSource("src", "app", "api", "orders", "[id]", "products", "route.ts"),
  productById: await readSource("src", "app", "api", "products", "[id]", "route.ts"),
  partById: await readSource("src", "app", "api", "parts", "[id]", "route.ts"),
  wholePart: await readSource("src", "app", "api", "products", "[id]", "whole-part", "route.ts"),
  productPartIntegrity: await readSource("src", "lib", "product-part-integrity.ts"),
  drawingUploadIntegrity: await readSource("src", "lib", "drawing-upload-integrity.ts"),
  drawingMainIntegrity: await readSource("src", "lib", "drawing-main-integrity.ts"),
  productionKittingIntegrity: await readSource("src", "lib", "production-kitting-integrity.ts"),
  productProgress: await readSource("src", "lib", "product-progress.ts"),
  kittingLib: await readSource("src", "lib", "kitting.ts"),
  drawingFiles: await readSource("src", "lib", "drawing-files.ts"),
  schema: await readSource("prisma", "schema.prisma"),
  drawingVersionMigration: await readSource("prisma", "migrations", "20260717131524_add_part_drawing_version_unique", "migration.sql"),
  drawingMainMigration: await readSource("prisma", "migrations", "20260717170000_add_part_drawing_main_unique", "migration.sql"),
  ordersLib: await readSource("src", "lib", "orders.ts"),
  writeRegistry: await readSource("scripts", "test-write-permissions.mjs"),
  pagePermissionTests: await readSource("scripts", "test-page-permissions.mjs"),
  self: await readSource("scripts", "test-api-permissions.mjs")
};

const thumbnailGet = functionBody(source.thumbnail, "GET");
const fileGet = functionBody(source.file, "GET");
const printThumbnailGet = functionBody(source.printThumbnail, "GET");
const partsGet = functionBody(source.partsDrawings, "GET");
const partsPost = functionBody(source.partsDrawings, "POST");
const deliveryGet = functionBody(source.delivery, "GET");
const deliveryPost = functionBody(source.delivery, "POST");
const deliveryDetailGet = functionBody(source.deliveryDetail, "GET");
const outsourcingGet = functionBody(source.outsourcing, "GET");
const outsourcingPost = functionBody(source.outsourcing, "POST");
const returnsGet = functionBody(source.returns, "GET");
const returnsPost = functionBody(source.returns, "POST");
const kittingGet = functionBody(source.kitting, "GET");
const kittingPost = functionBody(source.kitting, "POST");
const partAdvancePost = functionBody(source.partAdvance, "POST");
const partAbnormalPost = functionBody(source.partAbnormal, "POST");
const partAbnormalResolvePost = functionBody(source.partAbnormalResolve, "POST");
const productionCompletePost = functionBody(source.productionComplete, "POST");
const productPartsGet = functionBody(source.productParts, "GET");
const productPartsPost = functionBody(source.productParts, "POST");
const backupListGet = functionBody(source.backupList, "GET");
const importTemplateGet = functionBody(source.importTemplate, "GET");
const simpleTemplateGet = functionBody(source.simpleTemplate, "GET");
const orderImportTemplateGet = functionBody(source.orderImportTemplate, "GET");
const customerPost = functionBody(source.customers, "POST");
const customerPut = functionBody(source.customerById, "PUT");
const customerDelete = functionBody(source.customerById, "DELETE");
const orderPost = functionBody(source.orders, "POST");
const orderPut = functionBody(source.orderById, "PUT");
const orderDelete = functionBody(source.orderById, "DELETE");
const orderDeleteCatch = orderDelete.slice(orderDelete.lastIndexOf("} catch (error) {"));
const productPost = functionBody(source.orderProducts, "POST");
const productPut = functionBody(source.productById, "PUT");
const productDelete = functionBody(source.productById, "DELETE");
const productDeleteCatch = productDelete.slice(productDelete.lastIndexOf("} catch (error) {"));
const partPatch = functionBody(source.partById, "PATCH");
const partDelete = functionBody(source.partById, "DELETE");
const partDeleteCatch = partDelete.slice(partDelete.lastIndexOf("} catch (error) {"));
const wholePartPost = functionBody(source.wholePart, "POST");
const versionRetryLoop = sourceSlice(
  source.drawingUploadIntegrity,
  "while (versionConflictAttempts < MAX_VERSION_CREATE_ATTEMPTS)",
  "\n    throw new DrawingUploadError(500"
);
const drawingMainPost = functionBody(source.drawingMain, "POST");
const partDeleteBusinessConflictMessage = String.raw`\u8be5\u90e8\u4ef6\u5df2\u6709\u56fe\u7eb8\u3001\u5916\u53d1\u6216\u56de\u5382\u8bb0\u5f55\uff0c\u4e0d\u80fd\u5220\u9664`;
const partDeleteForeignKeyConflictMessage = String.raw`\u8be5\u90e8\u4ef6\u5df2\u6709\u4e1a\u52a1\u8bb0\u5f55\uff0c\u4e0d\u80fd\u5220\u9664`;

test("thumbnail route 导入统一 API 权限助手", () => {
  assert.match(source.thumbnail, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/);
});

test("thumbnail route 使用 drawing.view", () => {
  assert.match(thumbnailGet, /requireApiPermission\("drawing\.view"\)/);
});

test("thumbnail route 只调用一次 requireApiPermission", () => {
  assert.equal(occurrenceCount(thumbnailGet, 'requireApiPermission("drawing.view")'), 1);
});

test("thumbnail route 鉴权早于 params", () => {
  assertBefore(thumbnailGet, 'requireApiPermission("drawing.view")', "await context.params");
});

test("thumbnail route 鉴权早于文件服务调用", () => {
  assertBefore(thumbnailGet, 'requireApiPermission("drawing.view")', 'getDrawingFile(id, "thumbnail")');
});

test("thumbnail route 在权限失败后立即返回", () => {
  assert.match(thumbnailGet, /if \(!authResult\.ok\) return authResult\.response/);
});

test("thumbnail route 仍使用既有 private 文件服务", () => {
  assert.match(source.thumbnail, /import \{ contentDisposition, getDrawingFile \} from "@\/lib\/drawing-file-access"/);
});

test("thumbnail route 不再直接使用 requireApiUser", () => {
  assert.doesNotMatch(source.thumbnail, /requireApiUser/);
});

test("thumbnail route 不引入 public uploads 回退", () => {
  assert.doesNotMatch(source.thumbnail, /public\/uploads/);
});

test("thumbnail route 保持 nodejs runtime", () => {
  assert.match(source.thumbnail, /export const runtime = "nodejs"/);
});

test("file route 导入统一 API 权限助手", () => {
  assert.match(source.file, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/);
});

test("file route 使用 drawing.viewOriginal", () => {
  assert.match(fileGet, /requireApiPermission\("drawing\.viewOriginal"\)/);
});

test("file route 只调用一次 requireApiPermission", () => {
  assert.equal(occurrenceCount(fileGet, 'requireApiPermission("drawing.viewOriginal")'), 1);
});

test("file route 鉴权早于 params", () => {
  assertBefore(fileGet, 'requireApiPermission("drawing.viewOriginal")', "await context.params");
});

test("file route 鉴权早于文件服务调用", () => {
  assertBefore(fileGet, 'requireApiPermission("drawing.viewOriginal")', 'getDrawingFile(id, "file")');
});

test("file route 在权限失败后立即返回", () => {
  assert.match(fileGet, /if \(!authResult\.ok\) return authResult\.response/);
});

test("file route 保持既有文件服务", () => {
  assert.match(source.file, /import \{ contentDisposition, getDrawingFile \} from "@\/lib\/drawing-file-access"/);
});

test("file route 保持 inline Content-Disposition", () => {
  assert.match(fileGet, /"Content-Disposition": contentDisposition\(file\.fileName, file\.extension\)/);
});

test("file route 不新增 drawing.download", () => {
  assert.doesNotMatch(source.file, /drawing\.download/);
});

test("file route 不降级为 drawing.view", () => {
  assert.doesNotMatch(fileGet, /requireApiPermission\("drawing\.view"\)/);
});

test("parts drawings route 同时导入读取与全权限鉴权助手", () => {
  assert.match(source.partsDrawings, /requireApiPermission/);
  assert.match(source.partsDrawings, /requireApiAllPermissions/);
  assert.doesNotMatch(source.partsDrawings, /requireApiUser/);
});

test("parts drawings GET 使用 drawing.view", () => {
  assert.match(partsGet, /requireApiPermission\("drawing\.view"\)/);
});

test("parts drawings GET 只调用一次权限助手", () => {
  assert.equal(occurrenceCount(partsGet, 'requireApiPermission("drawing.view")'), 1);
});

test("parts drawings GET 鉴权早于 params", () => {
  assertBefore(partsGet, 'requireApiPermission("drawing.view")', "await context.params");
});

test("parts drawings GET 鉴权早于 Prisma 查询", () => {
  assertBefore(partsGet, 'requireApiPermission("drawing.view")', "prisma.partDrawing.findMany");
});

test("parts drawings GET 不再使用 requireApiUser", () => {
  assert.doesNotMatch(partsGet, /requireApiUser/);
});

test("parts drawings POST 使用完整上传权限而不回退 requireApiUser", () => {
  assert.match(partsPost, /requireApiAllPermissions\(\[\s*"part\.view",\s*"drawing\.view",\s*"drawing\.upload"\s*\]\)/);
  assert.doesNotMatch(partsPost, /requireApiUser/);
});

test("parts drawings POST 保留上传与写入关键代码", () => {
  assert.match(partsPost, /request\.formData\(\)/);
  assert.match(partsPost, /uploadDrawingBatch/);
  assert.match(partsPost, /DrawingUploadError/);
});

test("parts drawings GET 与 POST 使用不同图纸权限策略", () => {
  assert.match(partsGet, /requireApiPermission/);
  assert.match(partsPost, /requireApiAllPermissions/);
});

test("parts drawings route 没有全文件统一 drawing.view 鉴权", () => {
  assert.equal(occurrenceCount(source.partsDrawings, 'requireApiPermission("drawing.view")'), 1);
});

test("drawings page 导入页面权限助手", () => {
  assert.match(source.drawingsPage, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/);
});

test("drawings page 使用 drawing.view", () => {
  assert.match(source.drawingsPage, /requirePagePermission\("drawing\.view"\)/);
});

test("drawings page 只调用一次页面权限助手", () => {
  assert.equal(occurrenceCount(source.drawingsPage, 'requirePagePermission("drawing.view")'), 1);
});

test("drawings page 鉴权早于 Prisma 查询", () => {
  assert.ok(source.drawingsPage.indexOf('requirePagePermission("drawing.view")') < source.drawingsPage.indexOf("prisma.partDrawing.findMany"));
});

test("drawings page 不重复调用 requirePageUser", () => {
  assert.doesNotMatch(source.drawingsPage, /requirePageUser/);
});

test("drawings page 不直接读取 Cookie、Session 或角色", () => {
  assert.doesNotMatch(source.drawingsPage, /cookies\(|session|role\s*===/i);
});

test("print-thumbnail route 已在 C2b-1 接入权限助手", () => {
  assert.match(source.printThumbnail, /requireApiPermission\("drawing\.view"\)/);
  assert.doesNotMatch(source.printThumbnail, /requireApiUser/);
});

test("图纸 PATCH、DELETE 和设主图接入各自精确权限", () => {
  const drawingPatch = functionBody(source.drawingWrite, "PATCH");
  const drawingDelete = functionBody(source.drawingWrite, "DELETE");
  const drawingMainPost = functionBody(source.drawingMain, "POST");
  assert.match(drawingPatch, /requireApiAllPermissions\(\[\s*"drawing\.view",\s*"drawing\.update"\s*\]\)/);
  assert.match(drawingDelete, /requireApiAllPermissions\(\[\s*"drawing\.view",\s*"drawing\.obsolete"\s*\]\)/);
  assert.match(drawingMainPost, /requireApiAllPermissions\(\[\s*"drawing\.view",\s*"drawing\.setMain"\s*\]\)/);
  for (const handler of [drawingPatch, drawingDelete, drawingMainPost]) assert.doesNotMatch(handler, /requireApiUser/);
});

test("四个图纸写接口鉴权早于资源、请求体、文件处理和写入", () => {
  const drawingPatch = functionBody(source.drawingWrite, "PATCH");
  const drawingDelete = functionBody(source.drawingWrite, "DELETE");
  const drawingMainPost = functionBody(source.drawingMain, "POST");
  for (const marker of ["await context.params", "prisma.productPart.findUnique", "request.formData()", "uploadDrawingBatch"]) assertBefore(partsPost, "requireApiAllPermissions", marker);
  assertBefore(partsPost, "prisma.productPart.findUnique", "request.formData()");
  for (const marker of ["await context.params", "request.json()", "prisma.partDrawing.update"]) assertBefore(drawingPatch, "requireApiAllPermissions", marker);
  for (const marker of ["await context.params", "setMainDrawing"]) assertBefore(drawingMainPost, "requireApiAllPermissions", marker);
  for (const marker of ["await context.params", "prisma.partDrawing.update"]) assertBefore(drawingDelete, "requireApiAllPermissions", marker);
});

test("PATCH 拒绝通过 OBSOLETE 绕过独立作废权限，DELETE 保持逻辑作废", () => {
  const drawingPatch = functionBody(source.drawingWrite, "PATCH");
  const drawingDelete = functionBody(source.drawingWrite, "DELETE");
  assert.match(drawingPatch, /body\.status === "OBSOLETE"[\s\S]*?图纸作废请使用作废操作。[\s\S]*?status: 400/);
  assertBefore(drawingPatch, "body.status === \"OBSOLETE\"", "prisma.partDrawing.update");
  assert.doesNotMatch(drawingPatch, /drawing\.obsolete/);
  assert.match(drawingDelete, /data: \{ status: "OBSOLETE", isMain: false \}/);
  assert.doesNotMatch(drawingDelete, /partDrawing\.delete|deleteSavedDrawingFiles|\brm\(/);
  assert.doesNotMatch(drawingDelete, /drawing\.delete/);
});

test("设主图接口保持 POST 并委托完整性服务", () => {
  const drawingMainPost = functionBody(source.drawingMain, "POST");
  assert.match(source.drawingMain, /export async function POST/);
  assert.match(drawingMainPost, /setMainDrawing\(\{ drawingId: id, client: prisma \}\)/);
  assert.match(source.drawingMainIntegrity, /where: \{ partId: drawing\.partId \}/);
  assert.doesNotMatch(drawingMainPost, /productPart\.findUnique|part\.view/);
});

test("图纸上传保持 MIME 校验、文件保存与批量事务创建", () => {
  assert.match(partsPost, /uploadDrawingBatch/);
  assert.match(source.partsDrawings, /MAX_DRAWING_FILE_SIZE|drawing-upload-integrity/);
});

test("上传 Route 保持稳定 multipart 与服务错误响应", () => {
  assert.match(partsPost, /上传请求格式无效。/);
  assert.match(partsPost, /error instanceof DrawingUploadError/);
  assert.match(partsPost, /上传图纸失败。/);
  assert.doesNotMatch(partsPost, /errorMessage\(error, "上传图纸失败。"\)/);
});

test("上传完整性服务锁定限制、三重验证与稳定文案", async () => {
  const integrity = await readSource("src", "lib", "drawing-upload-integrity.ts");
  for (const marker of ["MAX_DRAWING_FILE_SIZE = 50 * 1024 * 1024", "MAX_DRAWING_FILE_COUNT = 20", "MAX_DRAWING_REQUEST_SIZE = 200 * 1024 * 1024", "单次最多上传 20 个图纸文件。", "单个图纸文件不能超过 50 MB。", "单次上传文件总大小不能超过 200 MB。", "图纸文件不能为空。", "图片文件损坏或格式不受支持。", "PDF文件格式无效。", "保存图纸文件失败。", "保存图纸记录失败。", "部件不存在。", "randomUUID"]) assert.match(integrity, new RegExp(escapeRegExp(marker)));
  assert.match(integrity, /sharp\(buffer\)\.metadata/);
  assert.match(integrity, /file\.type !== rule\.mime/);
  assert.match(integrity, /validSignature/);
  assert.match(integrity, /prevalidateDrawingFiles\(files, dependencies\)/);
});

test("上传文件工具保持随机文件名、wx 写入和缩略图降级", async () => {
  const files = await readSource("src", "lib", "drawing-files.ts");
  assert.match(files, /randomUUID/);
  assert.match(files, /flag: "wx"/);
  assert.match(files, /uploadStatus: "THUMBNAIL_FAILED"/);
  assert.match(files, /errorMessage: "缩略图生成失败。"/);
  assert.match(files, /isWithinRoot/);
});

test("文件服务保持 private-only 目录", () => {
  assert.match(source.fileAccess, /storage", "uploads", "drawings", "originals"/);
  assert.match(source.fileAccess, /storage", "uploads", "drawings", "thumbnails"/);
  assert.doesNotMatch(source.fileAccess, /public", "uploads"/);
});

test("文件服务保持路径穿越和 MIME 防护", () => {
  assert.match(source.fileAccess, /path\.resolve/);
  assert.match(source.fileAccess, /path\.relative/);
  assert.match(source.fileAccess, /mimeTypes\[extension\]/);
});

test("静态测试自身不引入数据库、网络或写文件操作", () => {
  const blocked = ["@prisma" + "/client", "write" + "File", "append" + "File", "fetch" + "(", "spawn" + "("];
  for (const marker of blocked) assert.equal(source.self.includes(marker), false, `测试脚本不得包含 ${marker}`);
});

test("print-thumbnail route 导入统一 API 权限助手", () => {
  assert.match(source.printThumbnail, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/);
});

test("print-thumbnail route 使用 drawing.view", () => {
  assert.match(printThumbnailGet, /requireApiPermission\("drawing\.view"\)/);
});

test("print-thumbnail route 只调用一次 requireApiPermission", () => {
  assert.equal(occurrenceCount(printThumbnailGet, 'requireApiPermission("drawing.view")'), 1);
});

test("print-thumbnail route 不使用 drawing.viewOriginal", () => {
  assert.doesNotMatch(printThumbnailGet, /drawing\.viewOriginal/);
});

test("print-thumbnail route 不新增 drawing.print", () => {
  assert.doesNotMatch(printThumbnailGet, /drawing\.print/);
});

test("print-thumbnail route 鉴权早于 params", () => {
  assertBefore(printThumbnailGet, 'requireApiPermission("drawing.view")', "await context.params");
});

test("print-thumbnail route 鉴权早于文件服务调用", () => {
  assertBefore(printThumbnailGet, 'requireApiPermission("drawing.view")', 'getDrawingFile(id, "print-thumbnail")');
});

test("print-thumbnail route 在权限失败后立即返回", () => {
  assert.match(printThumbnailGet, /if \(!authResult\.ok\) return authResult\.response/);
});

test("print-thumbnail route 保持 nodejs runtime", () => {
  assert.match(source.printThumbnail, /export const runtime = "nodejs"/);
});

test("print-thumbnail route 保持既有 private 文件服务", () => {
  assert.match(source.printThumbnail, /import \{ contentDisposition, getDrawingFile \} from "@\/lib\/drawing-file-access"/);
});

test("print thumbnail 保持 printThumbnailUrl 优先", () => {
  assert.match(source.fileAccess, /drawing\.printThumbnailUrl \?\? drawing\.thumbnailUrl/);
});

test("print thumbnail 保持 thumbnailUrl 回退", () => {
  assert.match(source.fileAccess, /variant === "thumbnail" \? drawing\.thumbnailUrl : drawing\.printThumbnailUrl \?\? drawing\.thumbnailUrl/);
});

test("print-thumbnail route 不引入 public runtime 回退", () => {
  assert.doesNotMatch(source.printThumbnail, /public\/uploads/);
});

test("普通 thumbnail 继续使用 drawing.view", () => {
  assert.match(thumbnailGet, /requireApiPermission\("drawing\.view"\)/);
});

test("原件 file 继续使用 drawing.viewOriginal", () => {
  assert.match(fileGet, /requireApiPermission\("drawing\.viewOriginal"\)/);
});

test("图纸 PATCH 以稳定语义处理无效 JSON、P2025 与未知错误", () => {
  const drawingPatch = functionBody(source.drawingWrite, "PATCH");
  assert.match(source.drawingWrite, /Prisma\.PrismaClientKnownRequestError/);
  assert.match(source.drawingWrite, /error\.code === "P2025"/);
  assertBefore(drawingPatch, "request.json()", "prisma.partDrawing.update");
  assert.match(drawingPatch, /图纸更新请求格式无效。[\s\S]*?status: 400/);
  assert.match(drawingPatch, /图纸不存在。[\s\S]*?status: 404/);
  assert.match(drawingPatch, /保存图纸失败。[\s\S]*?status: 500/);
  assert.doesNotMatch(drawingPatch, /errorMessage\(|error\.message/);
});

test("图纸 DELETE 保持逻辑作废并稳定映射 P2025 和未知错误", () => {
  const drawingDelete = functionBody(source.drawingWrite, "DELETE");
  assert.match(drawingDelete, /data: \{ status: "OBSOLETE", isMain: false \}/);
  assert.match(drawingDelete, /图纸不存在。[\s\S]*?status: 404/);
  assert.match(drawingDelete, /作废图纸失败。[\s\S]*?status: 500/);
  assert.doesNotMatch(drawingDelete, /errorMessage\(|error\.message|partDrawing\.delete/);
});

test("设主图服务保持查询和事务顺序，Route 保持稳定未知错误", () => {
  const drawingMainPost = functionBody(source.drawingMain, "POST");
  assert.match(source.drawingMainIntegrity, /已作废图纸不能设为主图。/);
  assertBefore(source.drawingMainIntegrity, "transaction.partDrawing.updateMany", "return transaction.partDrawing.update({");
  assert.match(source.drawingMainIntegrity, /图纸不存在。/);
  assert.match(drawingMainPost, /设置主图失败。[\s\S]*?status: 500/);
  assert.doesNotMatch(drawingMainPost, /errorMessage\(|part\.view/);
});

test("图纸 C3d-3a 不提前处理其他 Prisma 冲突或锁重试", () => {
  for (const route of [source.drawingWrite, source.drawingMain]) {
    assert.doesNotMatch(route, /P2002|P2034|locked|busy|retry/i);
  }
});

test("送货列表 route 导入统一 API 权限助手", () => {
  assert.match(source.delivery, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/);
});
test("送货列表 GET 只要求 delivery.view", () => {
  assert.equal(occurrenceCount(deliveryGet, 'requireApiPermission("delivery.view")'), 1);
  assert.doesNotMatch(deliveryGet, /delivery\.create/);
});
test("送货列表 GET 鉴权早于 Prisma 和响应构造", () => {
  assertBefore(deliveryGet, 'requireApiPermission("delivery.view")', "prisma.deliveryOrder.findMany");
  assertBefore(deliveryGet, 'requireApiPermission("delivery.view")', "NextResponse.json({ deliveryOrders })");
});
test("送货列表 GET 权限失败立即返回原响应", () => {
  assert.match(deliveryGet, /if \(!authResult\.ok\) return authResult\.response/);
});
test("送货列表 POST 保持 requireApiUser 认证", () => {
  assert.match(deliveryPost, /requireApiUser\(\)/);
  assert.doesNotMatch(deliveryPost, /requireApiPermission/);
});
test("送货列表 POST 保留事务和数量联动", () => {
  assert.match(deliveryPost, /prisma\.\$transaction/);
  assert.match(deliveryPost, /missingDeliveryQuantity/);
  assert.match(deliveryPost, /tx\.product\.update/);
});
test("送货详情 route 导入统一 API 权限助手", () => {
  assert.match(source.deliveryDetail, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/);
});
test("送货详情 GET 只要求一次 delivery.view", () => {
  assert.equal(occurrenceCount(deliveryDetailGet, 'requireApiPermission("delivery.view")'), 1);
  assert.doesNotMatch(deliveryDetailGet, /requireApiUser|delivery\.create/);
});
test("送货详情 GET 鉴权早于 params 和 Prisma", () => {
  assertBefore(deliveryDetailGet, 'requireApiPermission("delivery.view")', "await context.params");
  assertBefore(deliveryDetailGet, 'requireApiPermission("delivery.view")', "prisma.deliveryOrder.findFirst");
});
test("送货详情 GET 鉴权早于 404 判断并保留原 404", () => {
  assertBefore(deliveryDetailGet, 'requireApiPermission("delivery.view")', "if (!deliveryOrder)");
  assert.match(deliveryDetailGet, /送货单不存在。[\s\S]*?status: 404/);
});
test("外发列表 route 导入统一 API 权限助手", () => {
  assert.match(source.outsourcing, /import \{ requireApiAllPermissions, requireApiPermission \} from "@\/lib\/auth\/authorization"/);
});
test("外发列表 GET 只要求 outsource.view", () => {
  assert.equal(occurrenceCount(outsourcingGet, 'requireApiPermission("outsource.view")'), 1);
  assert.doesNotMatch(outsourcingGet, /outsource\.create/);
});
test("外发列表 GET 鉴权早于 Prisma 和响应构造", () => {
  assertBefore(outsourcingGet, 'requireApiPermission("outsource.view")', "prisma.outsourceOrder.findMany");
  assertBefore(outsourcingGet, 'requireApiPermission("outsource.view")', "NextResponse.json({ outsourceOrders })");
});
test("外发创建 POST 精确要求六项完整资源链权限", () => {
  assertAllPermissions(outsourcingPost, [
    "order.view",
    "product.view",
    "part.view",
    "drawing.view",
    "outsource.view",
    "outsource.create"
  ]);
});
test("外发创建 POST 不再使用登录助手或单权限助手", () => {
  assert.doesNotMatch(source.outsourcing, /requireApiUser/);
  assert.doesNotMatch(outsourcingPost, /requireApiPermission\(/);
});
test("外发创建 POST 权限失败立即返回", () => {
  assert.match(outsourcingPost, /if \(!authResult\.ok\) return authResult\.response/);
});
test("外发创建 POST 鉴权早于请求体和事务", () => {
  assertBefore(outsourcingPost, "requireApiAllPermissions", "request.json()");
  assertBefore(outsourcingPost, "requireApiAllPermissions", "prisma.$transaction");
});
test("外发创建 POST 鉴权早于编号和资源查询", () => {
  for (const marker of ["tx.outsourceOrder.findFirst", "tx.productPart.findMany", "tx.outsourceOrder.create"]) {
    assertBefore(outsourcingPost, "requireApiAllPermissions", marker);
  }
});
test("外发创建 POST 保持 WF 日期与三位流水规则", () => {
  assert.match(outsourcingPost, /const prefix = `WF\$\{formatOutsourceDate\(outsourceDate\)\}`/);
  assert.match(outsourcingPost, /latestOrder\.outsourceNo\.slice\(-3\)/);
  assert.match(outsourcingPost, /String\(latestSerial \+ 1\)\.padStart\(3, "0"\)/);
});
test("外发创建 POST 保留原事务和数量联动", () => {
  assert.match(outsourcingPost, /prisma\.\$transaction/);
  assert.match(outsourcingPost, /const outsourceNo =/);
  assert.match(outsourcingPost, /outsourcedQuantity: newOutsourcedQuantity/);
  assert.match(outsourcingPost, /missingQuantity: newOutsourcedQuantity - part\.returnedQuantity/);
  assert.match(outsourcingPost, /returnedQuantity: 0/);
});
test("外发创建 POST 保留图纸选择与快照优先级", () => {
  assert.match(outsourcingPost, /const drawing = pickOutsourceDrawing\(part\.drawings\)/);
  assert.match(outsourcingPost, /drawingId: drawing\?\.id \?\? null/);
  assert.match(outsourcingPost, /thumbnailUrl: drawing\?\.thumbnailUrl \?\? drawing\?\.printThumbnailUrl \?\? null/);
  assert.match(outsourcingPost, /originalUrl: drawing\?\.originalUrl \?\? null/);
});
test("外发创建 POST 保留 Part Product Order 状态联动", () => {
  assert.match(outsourcingPost, /tx\.productPart\.updateMany/);
  assert.match(outsourcingPost, /syncProductStatusFromParts\(tx, productId\)/);
  assert.match(outsourcingPost, /tx\.order\.updateMany/);
});
test("外发创建 POST 保持成功和当前错误语义", () => {
  assert.match(outsourcingPost, /NextResponse\.json\(\{ outsourceOrder \}\)/);
  assert.match(outsourcingPost, /error instanceof ValidationError \? 400 : 500/);
  assert.match(outsourcingPost, /errorMessage\(error, "创建外发单失败。"\)/);
});
test("外发创建 POST 未提前加入编号或锁重试", () => {
  assert.doesNotMatch(outsourcingPost, /P2002|P1008|P2034|SQLITE_BUSY|database is locked|MAX_.*ATTEMPTS/i);
});
test("回厂列表 route 导入统一 API 权限助手", () => {
  assert.match(source.returns, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/);
});
test("回厂列表 GET 只要求 return.view", () => {
  assert.equal(occurrenceCount(returnsGet, 'requireApiPermission("return.view")'), 1);
  assert.doesNotMatch(returnsGet, /return\.create/);
});
test("回厂列表 GET 鉴权早于 Prisma 和响应构造", () => {
  assertBefore(returnsGet, 'requireApiPermission("return.view")', "prisma.outsourceReturn.findMany");
  assertBefore(returnsGet, 'requireApiPermission("return.view")', "NextResponse.json({ returns })");
});
test("回厂列表 POST 保持 requireApiUser 认证", () => {
  assert.match(returnsPost, /requireApiUser\(\)/);
  assert.doesNotMatch(returnsPost, /requireApiPermission/);
});
test("回厂列表 POST 保留事务与数量状态联动", () => {
  assert.match(returnsPost, /prisma\.\$transaction/);
  assert.match(returnsPost, /returnedQuantity/);
  assert.match(returnsPost, /missingQuantity/);
});
test("四个新增 GET 均无角色、Cookie 或 Session 直读", () => {
  for (const handler of [deliveryGet, deliveryDetailGet, outsourcingGet, returnsGet]) {
    assert.doesNotMatch(handler, /cookies\(|document\.cookie|session|role\s*(?:===|!==)/i);
  }
});
test("四个新增 GET 均保持统一权限失败返回", () => {
  for (const handler of [deliveryGet, deliveryDetailGet, outsourcingGet, returnsGet]) {
    assert.match(handler, /if \(!authResult\.ok\) return authResult\.response/);
  }
});
test("齐套和产品部件 GET 不会额外接入写权限", () => {
  assert.doesNotMatch(kittingGet, /kitting\.execute/);
  assert.doesNotMatch(productPartsGet, /product\.update|part\.create/);
});
test("备份创建 route 尚未虚假接入读取权限", () => {
  assert.doesNotMatch(source.backupCreate, /requireApi(?:Any|All)?Permission/);
});

test("齐套 route 导入统一 API 权限助手", () => {
  assert.match(source.kitting, /import \{ requireApiAllPermissions, requireApiPermission \} from "@\/lib\/auth\/authorization"/);
});
test("齐套 GET 只要求一次 kitting.view", () => {
  assert.equal(occurrenceCount(kittingGet, 'requireApiPermission("kitting.view")'), 1);
});
test("齐套 GET 不额外要求产品、部件或图纸查看权限", () => {
  assert.doesNotMatch(kittingGet, /product\.view|part\.view|drawing\.view/);
});
test("齐套 GET 鉴权早于 params", () => {
  assertBefore(kittingGet, 'requireApiPermission("kitting.view")', "await context.params");
});
test("齐套 GET 鉴权早于齐套查询和原 404 判断", () => {
  assertBefore(kittingGet, 'requireApiPermission("kitting.view")', "getProductKitting(prisma, productId)");
  assertBefore(kittingGet, 'requireApiPermission("kitting.view")', "if (!kitting)");
  assert.match(kittingGet, /产品不存在。[\s\S]*?status: 404/);
});
test("齐套 GET 保持统一权限失败返回", () => {
  assert.match(kittingGet, /if \(!authResult\.ok\) return authResult\.response/);
});
test("齐套 POST 接入精确完整资源链和执行权限", () => {
  assertAllPermissions(kittingPost, ["order.view", "product.view", "part.view", "kitting.view", "kitting.execute"]);
  assert.doesNotMatch(kittingPost, /requireApiUser/);
});
test("齐套 POST 将事务委托给完整性服务", () => {
  assert.match(kittingPost, /refreshKittingState\(\{/);
  assert.match(kittingPost, /client: prisma/);
  assert.doesNotMatch(kittingPost, /await prisma\.\$transaction|prisma\.\$transaction\(/);
});
test("齐套 POST 鉴权早于 params 和完整性服务", () => {
  assertBefore(kittingPost, "requireApiAllPermissions", "context.params");
  assertBefore(kittingPost, "requireApiAllPermissions", "refreshKittingState");
});
test("齐套 POST 保持成功分支和错误语义", () => {
  for (const marker of ["该产品未维护部件，不能齐套。", "missingParts", "数量已齐，但存在异常记录，请处理后再送货。", "齐套检查完成，产品已进入待送货。"]) {
    assert.match(kittingPost, new RegExp(escapeRegExp(marker)));
  }
  assert.match(kittingPost, /ProductionKittingError/);
  assert.match(kittingPost, /操作失败，请稍后重试。[\s\S]*?status: 500/);
});
test("齐套 POST 不在 Route 内实现自动回退或并发重试", () => {
  assert.doesNotMatch(kittingPost, /P2025|P2002|P2003|P2034|SQLITE_BUSY|database is locked|updateMany/i);
});

test("推进部件精确要求五项生产权限", () => {
  assertAllPermissions(partAdvancePost, ["order.view", "product.view", "part.view", "production.view", "production.updateProgress"]);
});
test("推进部件鉴权早于 params、JSON 和完整性服务", () => {
  assertBefore(partAdvancePost, "requireApiAllPermissions", "context.params");
  assertBefore(partAdvancePost, "requireApiAllPermissions", "request.json()");
  assertBefore(partAdvancePost, "requireApiAllPermissions", "advancePartProduction");
});
test("推进部件要求 expectedStatus 且不接收目标状态", () => {
  assert.match(partAdvancePost, /expectedStatusValue/);
  assert.match(partAdvancePost, /isProductPartStatus\(expectedStatusValue\)/);
  assert.match(partAdvancePost, /expectedStatus: expectedStatusValue/);
  assert.doesNotMatch(partAdvancePost, /nextStatus|targetStatus|toStatus/);
  assert.doesNotMatch(partAdvancePost, /returnedQuantity|missingQuantity|outsourcedQuantity/);
});
test("推进部件使用稳定错误且 Route 不实现事务", () => {
  assert.match(partAdvancePost, /stableErrorResponse\(error\)/);
  assert.doesNotMatch(partAdvancePost, /errorMessage|await prisma\.\$transaction|prisma\.\$transaction\(|updateMany/);
});

test("登记异常精确要求五项生产权限", () => {
  assertAllPermissions(partAbnormalPost, ["order.view", "product.view", "part.view", "production.view", "production.reportAbnormal"]);
});
test("登记异常鉴权早于 params、JSON 和完整性服务", () => {
  for (const marker of ["context.params", "request.json()", "reportPartAbnormal"]) {
    assertBefore(partAbnormalPost, "requireApiAllPermissions", marker);
  }
});
test("登记异常 Route 只验证原因并调用完整性服务", () => {
  assert.match(partAbnormalPost, /reportPartAbnormal\(\{/);
  assert.match(partAbnormalPost, /partId: id/);
  assert.match(partAbnormalPost, /\breason\b/);
  assert.doesNotMatch(partAbnormalPost, /productPartAbnormal\.(?:find|create)|productPart\.update/);
});
test("登记异常使用稳定错误且不回显任意 error.message", () => {
  assert.match(partAbnormalPost, /stableErrorResponse\(error\)/);
  assert.doesNotMatch(partAbnormalPost, /errorMessage|error instanceof Error \? error\.message/);
});

test("处理异常精确要求五项生产权限", () => {
  assertAllPermissions(partAbnormalResolvePost, ["order.view", "product.view", "part.view", "production.abnormal.view", "production.resolveAbnormal"]);
});
test("处理异常鉴权早于 params、JSON 和完整性服务", () => {
  for (const marker of ["context.params", "request.json()", "resolvePartAbnormal"]) {
    assertBefore(partAbnormalResolvePost, "requireApiAllPermissions", marker);
  }
});
test("处理异常不要求 Client 提交恢复状态并兼容校验旧字段", () => {
  assert.match(partAbnormalResolvePost, /body\.status \?\? body\.restoreStatus/);
  assert.match(partAbnormalResolvePost, /requestedStatus/);
  assert.match(partAbnormalResolvePost, /resolvePartAbnormal\(\{/);
  assert.doesNotMatch(partAbnormalResolvePost, /status: restoreStatus|productPartAbnormal\.update/);
});
test("处理异常使用稳定错误且 Route 不实现事务", () => {
  assert.match(partAbnormalResolvePost, /stableErrorResponse\(error\)/);
  assert.doesNotMatch(partAbnormalResolvePost, /errorMessage|await prisma\.\$transaction|prisma\.\$transaction\(|updateMany/);
});

test("标记生产完成精确要求五项生产权限", () => {
  assertAllPermissions(productionCompletePost, ["order.view", "product.view", "part.view", "production.view", "production.completeProduct"]);
});
test("标记生产完成鉴权早于 params 和完整性服务", () => {
  assertBefore(productionCompletePost, "requireApiAllPermissions", "context.params");
  assertBefore(productionCompletePost, "requireApiAllPermissions", "markProductProductionComplete");
});
test("标记生产完成 Route 不接收数量并委托完整性服务", () => {
  assert.match(productionCompletePost, /markProductProductionComplete\(\{/);
  assert.match(productionCompletePost, /productId: id/);
  assert.doesNotMatch(productionCompletePost, /returnedQuantity|missingQuantity|outsourcedQuantity|productPart\.update/);
});
test("标记生产完成返回服务结果并使用稳定错误", () => {
  assert.match(productionCompletePost, /NextResponse\.json\(result\)/);
  assert.match(productionCompletePost, /stableErrorResponse\(error\)/);
  assert.doesNotMatch(productionCompletePost, /errorMessage|await prisma\.\$transaction|prisma\.\$transaction\(|updateMany/);
});

test("五个 C3e-1 Route 均移除 requireApiUser 并立即返回权限失败", () => {
  for (const [routeSource, handler] of [
    [source.partAdvance, partAdvancePost],
    [source.partAbnormal, partAbnormalPost],
    [source.partAbnormalResolve, partAbnormalResolvePost],
    [source.productionComplete, productionCompletePost],
    [source.kitting, kittingPost]
  ]) {
    assert.doesNotMatch(routeSource, /requireApiUser/);
    assert.match(handler, /if \(!authResult\.ok\) return authResult\.response/);
  }
});
test("产品部件 route 导入全部权限助手", () => {
  assert.match(source.productParts, /import \{ requireApiAllPermissions \} from "@\/lib\/auth\/authorization"/);
});
test("产品部件 GET 精确要求 product.view 和 part.view", () => {
  assert.match(productPartsGet, /requireApiAllPermissions\(\[\s*"product\.view",\s*"part\.view"\s*\]\)/);
});
test("产品部件 GET 不额外要求第三个业务权限", () => {
  assert.doesNotMatch(productPartsGet, /order\.view|drawing\.view|product\.update|part\.create/);
});
test("产品部件 GET 多权限鉴权早于 params 和 Prisma", () => {
  assertBefore(productPartsGet, "requireApiAllPermissions", "await context.params");
  assertBefore(productPartsGet, "requireApiAllPermissions", "prisma.productPart.findMany");
});
test("产品部件 GET 保持空数组语义而不新增产品查询或 404", () => {
  assert.doesNotMatch(productPartsGet, /prisma\.product\.findUnique|status: 404/);
  assert.match(productPartsGet, /NextResponse\.json\(\{ parts \}\)/);
});
test("产品部件 GET 保持统一权限失败返回", () => {
  assert.match(productPartsGet, /if \(!authResult\.ok\) return authResult\.response/);
});
test("产品部件 POST 已接入部件创建完整资源链权限", () => {
  assert.match(productPartsPost, /requireApiAllPermissions\(\[\s*"product\.view",\s*"part\.view",\s*"part\.create"\s*\]\)/);
  assert.doesNotMatch(source.productParts, /requireApiUser/);
});
test("产品部件 POST 保留请求体、数量计算与创建逻辑", () => {
  assert.match(productPartsPost, /await request\.json\(\)/);
  assert.match(productPartsPost, /calculatePartTotalQuantity/);
  assert.match(productPartsPost, /prisma\.productPart\.create/);
});
test("新读取 API 测试使用独立 GET 函数体", () => {
  assert.doesNotMatch(kittingGet, /export async function POST/);
  assert.doesNotMatch(productPartsGet, /export async function POST/);
});
test("导入模板下载不提前要求 import.execute", () => {
  assert.doesNotMatch(importTemplateGet, /import\.execute/);
  assert.doesNotMatch(simpleTemplateGet, /import\.execute/);
});
test("API 权限静态测试自身不连接数据库或写文件", () => {
  const forbiddenDatabase = [
    new RegExp(`new\\s+Prisma${"Client"}\\s*\\(`),
    new RegExp(`from\\s+["']@${"prisma"}/client["']`),
    new RegExp(`require\\(["']@${"prisma"}/client["']\\)`),
    new RegExp(`@/lib/${"prisma"}`)
  ];
  const forbiddenWrites = [
    new RegExp(`w${"rite"}File\\s*\\(`),
    new RegExp(`a${"ppend"}File\\s*\\(`),
    new RegExp(`m${"kdir"}\\s*\\(`)
  ];
  for (const pattern of forbiddenDatabase) assert.doesNotMatch(source.self, pattern);
  for (const pattern of forbiddenWrites) assert.doesNotMatch(source.self, pattern);
});
test("备份列表 route 导入统一 API 权限助手", () => assert.match(source.backupList, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/));
test("备份列表 GET 只要求 backup.view", () => { assert.equal(occurrenceCount(backupListGet, 'requireApiPermission("backup.view")'), 1); assert.doesNotMatch(backupListGet, /backup\.create/); });
test("备份列表鉴权早于文件系统和 Git", () => { for (const marker of ["readdir(backupRoot", "stat(databasePath)", "readFile(path.join", "open(databasePath", "git([\"rev-parse\""]) assertBefore(backupListGet, 'requireApiPermission("backup.view")', marker); });
test("备份列表保留排序、空列表与 JSON 响应", () => { assert.match(backupListGet, /\.catch\(\(\) => \[\]\)/); assert.match(backupListGet, /records\.sort/); assert.match(backupListGet, /NextResponse\.json\(\{ success: true, records/); });
test("备份列表不新增下载或用户路径", () => assert.doesNotMatch(backupListGet, /Content-Disposition|searchParams|request\.url/));
test("标准模板 route 导入统一 API 权限助手", () => assert.match(source.importTemplate, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/));
test("标准模板 GET 只要求 import.view", () => { assert.equal(occurrenceCount(importTemplateGet, 'requireApiPermission("import.view")'), 1); assert.doesNotMatch(importTemplateGet, /import\.preview|import\.execute/); });
test("标准模板鉴权早于工作簿与响应构造", () => { for (const marker of ["new ExcelJS.Workbook", "addWorksheet", "writeBuffer", "Content-Disposition"]) assertBefore(importTemplateGet, 'requireApiPermission("import.view")', marker); });
test("标准模板保留文件名、MIME 和错误文案", () => { assert.match(importTemplateGet, /订单产品部件导入模板\.xlsx/); assert.match(importTemplateGet, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/); assert.match(importTemplateGet, /下载模板失败。/); });
test("简化模板 route 导入统一 API 权限助手", () => assert.match(source.simpleTemplate, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/));
test("简化模板 GET 只要求 import.view", () => { assert.equal(occurrenceCount(simpleTemplateGet, 'requireApiPermission("import.view")'), 1); assert.doesNotMatch(simpleTemplateGet, /import\.preview|import\.execute/); });
test("简化模板鉴权早于工作簿和 writeBuffer", () => { assertBefore(simpleTemplateGet, 'requireApiPermission("import.view")', "new ExcelJS.Workbook"); assertBefore(simpleTemplateGet, 'requireApiPermission("import.view")', "writeBuffer"); });
test("简化模板保留文件名、MIME 和错误文案", () => { assert.match(simpleTemplateGet, /全局简易导入模板\.xlsx/); assert.match(simpleTemplateGet, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/); assert.match(simpleTemplateGet, /下载模板失败。/); });
test("订单模板 route 导入全部权限助手", () => assert.match(source.orderImportTemplate, /import \{ requireApiAllPermissions \} from "@\/lib\/auth\/authorization"/));
test("订单模板 GET 精确要求订单查看和导入权限", () => assert.match(orderImportTemplateGet, /requireApiAllPermissions\(\[\s*"order\.view",\s*"order\.importProducts"\s*\]\)/));
test("订单模板 GET 不额外要求第三个权限或 import.view", () => assert.doesNotMatch(orderImportTemplateGet, /import\.view|order\.update|part\.create/));
test("订单模板鉴权早于工作簿和 writeBuffer", () => { assertBefore(orderImportTemplateGet, "requireApiAllPermissions", "new ExcelJS.Workbook"); assertBefore(orderImportTemplateGet, "requireApiAllPermissions", "writeBuffer"); });
test("订单模板保持无 params、Prisma 与 404", () => assert.doesNotMatch(orderImportTemplateGet, /context\.params|prisma\.|status: 404/));
test("订单模板保留文件名、MIME 和模板结构", () => { assert.match(orderImportTemplateGet, /订单产品部件导入模板\.xlsx/); assert.match(orderImportTemplateGet, /ORDER_PRODUCT_IMPORT_HEADERS/); assert.match(orderImportTemplateGet, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/); });
test("四个新增下载和列表 GET 均保持统一权限失败返回", () => { for (const handler of [backupListGet, importTemplateGet, simpleTemplateGet, orderImportTemplateGet]) assert.match(handler, /if \(!authResult\.ok\) return authResult\.response/); });
test("三个模板 GET 不读取 Prisma、params 或本地文件", () => { for (const handler of [importTemplateGet, simpleTemplateGet, orderImportTemplateGet]) assert.doesNotMatch(handler, /prisma\.|context\.params|readFile\(|readdir\(/); });
test("备份创建和导入写接口未提前接入权限助手", () => assert.doesNotMatch(source.backupCreate, /requireApi(?:Any|All)?Permission/));
test("导入预览和确认接口仍未提前接入权限助手", async () => { const paths = [["imports","excel","preview","route.ts"],["imports","excel","confirm","route.ts"],["imports","excel","simple-preview","route.ts"],["imports","excel","simple-confirm","route.ts"],["orders","[id]","import-products","confirm","route.ts"]]; for (const segments of paths) assert.doesNotMatch(await readSource("src","app","api",...segments), /requireApi(?:Any|All)?Permission/); });
test("新增 route 测试均使用独立 GET 函数体", () => { for (const handler of [backupListGet, importTemplateGet, simpleTemplateGet, orderImportTemplateGet]) assert.doesNotMatch(handler, /export async function POST/); });
test("模板 GET 不直接使用 requireApiUser", () => { for (const handler of [importTemplateGet, simpleTemplateGet, orderImportTemplateGet]) assert.doesNotMatch(handler, /requireApiUser/); });
test("备份列表 GET 不直接使用 requireApiUser", () => assert.doesNotMatch(backupListGet, /requireApiUser/));
test("订单模板 GET 不连续调用单权限助手", () => assert.doesNotMatch(orderImportTemplateGet, /requireApiPermission\(/));
test("模板 GET 保持二进制 Response 返回", () => { for (const handler of [importTemplateGet, simpleTemplateGet, orderImportTemplateGet]) assert.match(handler, /return new Response\(buffer/); });

test("客户写 route 导入全部权限助手且不再导入登录助手", () => {
  for (const content of [source.customers, source.customerById]) {
    assert.match(content, /import \{ requireApiAllPermissions \} from "@\/lib\/auth\/authorization"/);
    assert.doesNotMatch(content, /requireApiUser/);
  }
});
test("客户 POST 精确要求 view 和 create", () => assert.match(customerPost, /requireApiAllPermissions\(\[\s*"customer\.view",\s*"customer\.create"\s*\]\)/));
test("客户 PUT 精确要求 view 和 update", () => assert.match(customerPut, /requireApiAllPermissions\(\[\s*"customer\.view",\s*"customer\.update"\s*\]\)/));
test("客户 DELETE 精确要求 view 和 delete", () => assert.match(customerDelete, /requireApiAllPermissions\(\[\s*"customer\.view",\s*"customer\.delete"\s*\]\)/));
test("客户三个写接口权限失败立即返回统一响应", () => {
  for (const handler of [customerPost, customerPut, customerDelete]) assert.match(handler, /if \(!authResult\.ok\) return authResult\.response/);
});
test("客户 POST 鉴权早于 JSON 和 create", () => {
  assertBefore(customerPost, "requireApiAllPermissions", "request.json()");
  assertBefore(customerPost, "requireApiAllPermissions", "prisma.customer.create");
});
test("客户 PUT 鉴权早于 params、JSON 和 update", () => {
  for (const marker of ["await context.params", "request.json()", "prisma.customer.update"]) assertBefore(customerPut, "requireApiAllPermissions", marker);
});
test("客户 DELETE 鉴权早于 params、订单检查和 delete", () => {
  for (const marker of ["await context.params", "prisma.order.count", "prisma.customer.delete"]) assertBefore(customerDelete, "requireApiAllPermissions", marker);
});
test("客户 POST PUT DELETE 分别提取独立函数体", () => {
  assert.doesNotMatch(customerPost, /customer\.update|customer\.delete/);
  assert.doesNotMatch(customerPut, /customer\.create|customer\.delete/);
  assert.doesNotMatch(customerDelete, /customer\.create|customer\.update/);
});
test("客户删除关联订单冲突保持中文文案并返回 409", () => assert.match(customerDelete, /该客户已有订单，不能直接删除。[\s\S]*?status: 409/));
test("客户 PUT 和 DELETE 将 Prisma P2025 映射为 404", () => {
  assert.match(source.customerById, /error\.code === "P2025"/);
  for (const handler of [customerPut, customerDelete]) assert.match(handler, /isRecordNotFoundError\(error\)[\s\S]*?客户不存在。[\s\S]*?status: 404/);
});
test("客户写接口保持原字段白名单与成功响应", () => {
  for (const field of ["name", "contact", "phone", "address", "remark"]) {
    assert.match(customerPost, new RegExp(`(?:body\\.${field}|${field},)`));
    assert.match(customerPut, new RegExp(`(?:body\\.${field}|${field},)`));
  }
  assert.match(customerPost, /NextResponse\.json\(\{ customer \}\)/);
  assert.match(customerPut, /NextResponse\.json\(\{ customer \}\)/);
  assert.match(customerDelete, /NextResponse\.json\(\{ ok: true \}\)/);
});
test("C3f-1 写权限登记包含二十三个 protected 接口", () => {
  assert.match(source.writeRegistry, /const protectedHandlers = new Map/);
  assert.match(source.writeRegistry, /assert\.equal\(protectedHandlers\.size, 23\)/);
  assert.match(source.writeRegistry, /assert\.equal\(pendingHandlers\.size, 9\)/);
  assert.match(source.writeRegistry, /\["POST \/api\/outsourcing", \{ stage: "C3f-1", permissions:/);
});

test("订单写 route 导入全部权限助手且不再导入登录助手", () => {
  for (const content of [source.orders, source.orderById]) {
    assert.match(content, /import \{ requireApiAllPermissions \} from "@\/lib\/auth\/authorization"/);
    assert.doesNotMatch(content, /requireApiUser/);
  }
});
test("订单 POST 精确要求 view 和 create", () => assert.match(orderPost, /requireApiAllPermissions\(\[\s*"order\.view",\s*"order\.create"\s*\]\)/));
test("订单 PUT 精确要求 view 和 update", () => assert.match(orderPut, /requireApiAllPermissions\(\[\s*"order\.view",\s*"order\.update"\s*\]\)/));
test("订单 DELETE 精确要求 view 和 delete", () => assert.match(orderDelete, /requireApiAllPermissions\(\[\s*"order\.view",\s*"order\.delete"\s*\]\)/));
test("订单三个写接口权限失败立即返回统一响应", () => {
  for (const handler of [orderPost, orderPut, orderDelete]) assert.match(handler, /if \(!authResult\.ok\) return authResult\.response/);
});
test("订单 POST 鉴权早于 JSON、客户查询、编号和新增", () => {
  for (const marker of ["request.json()", "prisma.customer.findUnique", "createOrderWithGeneratedNo"]) assertBefore(orderPost, "requireApiAllPermissions", marker);
});
test("订单 PUT 鉴权早于 params、JSON、客户查询和更新", () => {
  for (const marker of ["await context.params", "request.json()", "prisma.customer.findUnique", "prisma.order.update"]) assertBefore(orderPut, "requireApiAllPermissions", marker);
});
test("订单 DELETE 鉴权早于 params、查询、关联检查和事务", () => {
  for (const marker of ["await context.params", "prisma.order.findUnique", "prisma.partDrawing.count", "prisma.$transaction", "prisma.order.delete"]) assertBefore(orderDelete, "requireApiAllPermissions", marker);
});
test("订单 POST 和 PUT 无效 JSON 精确返回 400", () => {
  for (const handler of [orderPost, orderPut]) assert.match(handler, /catch \(error\)[\s\S]*?error instanceof SyntaxError[\s\S]*?status: 400/);
});
test("订单 POST 保持字段白名单并固定 PENDING", () => {
  for (const field of ["customerId", "orderDate", "deliveryDate", "remark"]) assert.match(orderPost, new RegExp(`body\\.${field}`));
  assert.doesNotMatch(orderPost, /body\.status/);
  assert.match(source.ordersLib, /status: "PENDING"/);
  assert.match(orderPost, /NextResponse\.json\(\{ order \}\)/);
});
test("订单 PUT 保持其余字段白名单且不再更新 status", () => {
  for (const field of ["customerId", "orderDate", "deliveryDate", "remark"]) assert.match(orderPut, new RegExp(`body\\.${field}`));
  assert.match(orderPut, /customerName: customer\.name/);
  assert.match(orderPut, /NextResponse\.json\(\{ order \}\)/);
  const updateData = sourceSlice(orderPut, "data: {", "\n      }");
  assert.doesNotMatch(updateData, /\bstatus\b/);
});
test("订单 PUT 使用可靠的自有 status 属性检查", () => {
  assert.match(orderPut, /Object\.prototype\.hasOwnProperty\.call\(body, "status"\)/);
  assert.doesNotMatch(orderPut, /body\.status\s*(?:===|!==)|allowedStatuses/);
});
test("订单 PUT 只要包含 status 就返回稳定 400 文案", () => {
  assert.match(orderPut, /if \(Object\.prototype\.hasOwnProperty\.call\(body, "status"\)\) \{\s*return NextResponse\.json\(\{ error: "订单状态只能由业务流程自动更新" \}, \{ status: 400 \}\)/);
});
test("订单 PUT 在 JSON 后且客户查询和 update 前拒绝 status", () => {
  assertBefore(orderPut, "request.json()", "Object.prototype.hasOwnProperty.call");
  assertBefore(orderPut, "Object.prototype.hasOwnProperty.call", "prisma.customer.findUnique");
  assertBefore(orderPut, "Object.prototype.hasOwnProperty.call", "prisma.order.update");
});
test("订单 PUT 删除旧状态枚举编辑逻辑", () => {
  assert.doesNotMatch(source.orderById, /OrderStatus|allowedStatuses/);
});
test("订单 PUT 和 DELETE 将 Prisma P2025 映射为 404", () => {
  assert.match(source.orderById, /error\.code === "P2025"/);
  for (const handler of [orderPut, orderDelete]) assert.match(handler, /isRecordNotFoundError\(error\)[\s\S]*?订单不存在。[\s\S]*?status: 404/);
});
test("订单 DELETE 显式不存在检查继续返回 404", () => assert.match(orderDelete, /if \(!order\)[\s\S]*?订单不存在。[\s\S]*?status: 404/));
test("订单 DELETE 显式关联冲突保持完整中文文案和 409", () => {
  assert.match(
    source.orderById,
    /const protectedOrderDeleteMessage =\s*"该订单已有图纸、生产、外发、回厂、送货或异常记录，不能直接删除。请先确认业务记录后再处理。";/
  );
  assert.match(orderDelete, /if \(hasBusinessRecords\)[\s\S]*?protectedOrderDeleteMessage[\s\S]*?status: 409/);
});
test("订单 DELETE 保持普通产品部件清理事务与成功响应", () => {
  assert.match(orderDelete, /prisma\.\$transaction\(\[/);
  assert.match(orderDelete, /prisma\.productPart\.deleteMany\(\{ where: \{ orderId: id \} \}\)/);
  assert.match(orderDelete, /prisma\.product\.deleteMany\(\{ where: \{ orderId: id \} \}\)/);
  assert.match(orderDelete, /prisma\.order\.delete\(\{ where: \{ id \} \}\)/);
  assert.match(orderDelete, /NextResponse\.json\(\{ ok: true \}\)/);
});
test("订单 POST 委托编号创建服务且不再直接生成和新增", () => {
  assert.match(orderPost, /createOrderWithGeneratedNo\(prisma, \{/);
  assert.doesNotMatch(orderPost, /generateOrderNo|prisma\.order\.create/);
});
test("订单 POST 向创建服务只传批准字段", () => {
  const serviceCall = sourceSlice(orderPost, "createOrderWithGeneratedNo(prisma, {", "});");
  for (const field of ["customerId", "customerName", "orderDate", "deliveryDate", "remark"]) {
    assert.match(serviceCall, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(serviceCall, /status|\.\.\./);
});
test("订单 POST 日流水上限精确映射 409", () => {
  const finalCatch = orderPost.slice(orderPost.lastIndexOf("} catch (error) {"));
  assert.match(finalCatch, /error instanceof OrderDailySequenceLimitError/);
  assert.match(source.ordersLib, /当日订单编号已达 999 上限，无法新增订单。/);
  assert.match(finalCatch, /status: 409/);
});
test("订单 POST 编号冲突耗尽精确映射 409", () => {
  const finalCatch = orderPost.slice(orderPost.lastIndexOf("} catch (error) {"));
  assert.match(finalCatch, /error instanceof OrderNumberConflictError/);
  assert.match(source.ordersLib, /订单编号生成冲突，请重试。/);
  assert.match(finalCatch, /status: 409/);
});
test("订单 POST 未知错误保持原 500", () => {
  const finalCatch = orderPost.slice(orderPost.lastIndexOf("} catch (error) {"));
  assert.match(finalCatch, /新增订单失败。/);
  assert.match(finalCatch, /status: 500/);
});
test("订单 POST 创建服务位于客户查询和日期解析之后", () => {
  assertBefore(orderPost, "prisma.customer.findUnique", "createOrderWithGeneratedNo");
  assertBefore(orderPost, "const orderDate = parseDate", "createOrderWithGeneratedNo");
});
test("订单 DELETE 通过 Prisma 运行时已知错误精确识别 P2003", () => {
  assert.match(source.orderById, /import \{ Prisma \} from "@prisma\/client"/);
  assert.match(
    source.orderById,
    /error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === "P2003"/
  );
});
test("订单 DELETE catch 继续优先将 P2025 映射为 404", () => {
  assert.match(orderDeleteCatch, /if \(isRecordNotFoundError\(error\)\)[\s\S]*?订单不存在。[\s\S]*?status: 404/);
  assertBefore(orderDeleteCatch, "isRecordNotFoundError(error)", "isOrderDeleteConflictError(error)");
});
test("订单 DELETE catch 将 P2003 独立映射为 409", () => {
  assert.match(orderDeleteCatch, /if \(isOrderDeleteConflictError\(error\)\)[\s\S]*?status: 409/);
  assert.equal(occurrenceCount(orderDeleteCatch, "if (isRecordNotFoundError(error))"), 1);
  assert.equal(occurrenceCount(orderDeleteCatch, "if (isOrderDeleteConflictError(error))"), 1);
});
test("订单 DELETE 显式冲突和 P2003 catch 复用同一文案常量", () => {
  assert.equal(occurrenceCount(orderDelete, "protectedOrderDeleteMessage"), 2);
  assert.match(orderDeleteCatch, /error: protectedOrderDeleteMessage/);
});
test("订单 DELETE 未知错误继续返回原 500 文案", () => {
  assert.match(orderDeleteCatch, /删除订单失败。[\s\S]*?status: 500/);
});
test("订单 DELETE P2003 判断不依赖元数据且不实现锁错误重试", () => {
  const helper = sourceSlice(source.orderById, "function isOrderDeleteConflictError", "const protectedOrderDeleteMessage");
  assert.doesNotMatch(helper, /\.meta|field_name|P2002|P1008|P2024|P2034|locked|retry/i);
});
test("订单 DELETE 关联检查保持在原批量事务之前", () => {
  const transaction = sourceSlice(orderDelete, "prisma.$transaction([", "]);\n\n    return NextResponse.json");
  assertBefore(orderDelete, "const hasBusinessRecords", "prisma.$transaction");
  assert.doesNotMatch(transaction, /\.count\(|hasBusinessRecords/);
});
test("订单接口不提前实现状态转换矩阵", () => {
  assert.doesNotMatch(source.orderById, /transition|状态转换|allowedTransitions/i);
});

test("产品写 route 导入全部权限助手且不再导入登录助手", () => {
  for (const content of [source.orderProducts, source.productById]) {
    assert.match(content, /import \{ requireApiAllPermissions \} from "@\/lib\/auth\/authorization"/);
    assert.doesNotMatch(content, /requireApiUser/);
  }
});
test("创建产品 POST 精确要求订单查看、产品查看和产品创建权限", () => {
  assert.match(productPost, /requireApiAllPermissions\(\[\s*"order\.view",\s*"product\.view",\s*"product\.create"\s*\]\)/);
});
test("更新产品 PUT 精确要求产品查看和更新权限", () => {
  assert.match(productPut, /requireApiAllPermissions\(\[\s*"product\.view",\s*"product\.update"\s*\]\)/);
});
test("删除产品 DELETE 精确要求产品查看和删除权限", () => {
  assert.match(productDelete, /requireApiAllPermissions\(\[\s*"product\.view",\s*"product\.delete"\s*\]\)/);
});
test("三个产品写接口权限失败后立即返回", () => {
  for (const handler of [productPost, productPut, productDelete]) {
    assert.match(handler, /if \(!authResult\.ok\) return authResult\.response/);
  }
});
test("创建产品鉴权早于 params、JSON、父订单查询和 create", () => {
  for (const marker of ["await context.params", "request.json()", "prisma.order.findUnique", "prisma.product.create"]) {
    assertBefore(productPost, "requireApiAllPermissions", marker);
  }
});
test("更新产品鉴权早于 params、JSON 和 update", () => {
  for (const marker of ["await context.params", "request.json()", "prisma.product.update"]) {
    assertBefore(productPut, "requireApiAllPermissions", marker);
  }
});
test("删除产品鉴权早于 params、目标查询、关联检查和删除事务", () => {
  for (const marker of ["await context.params", "prisma.product.findUnique", "prisma.partDrawing.count", "prisma.$transaction", "prisma.product.delete"]) {
    assertBefore(productDelete, "requireApiAllPermissions", marker);
  }
});
test("创建产品保持父订单不存在的 404 语义", () => {
  assert.match(productPost, /if \(!order\)[\s\S]*?订单不存在。[\s\S]*?status: 404/);
});
test("产品创建和更新保持原字段白名单与成功响应", () => {
  const fields = ["productName", "specification", "material", "quantity", "surfaceTreatment", "remark"];
  for (const field of fields) {
    assert.match(productPost, new RegExp(`(?:body\\.${field}|\\b${field},)`));
    assert.match(productPut, new RegExp(`(?:body\\.${field}|\\b${field},)`));
  }
  for (const handler of [productPost, productPut]) {
    assert.doesNotMatch(handler, /\.\.\.body|body\.status/);
    assert.match(handler, /NextResponse\.json\(\{ product \}\)/);
  }
  assert.match(productPost, /status: "PENDING"/);
});
test("产品更新保持部件产品数量独立且不联动既有部件", () => {
  assert.doesNotMatch(productPut, /productPart|totalQuantity|outsourcedQuantity|returnedQuantity|missingQuantity|\$transaction/);
});
test("产品更新使用严格数量解析并保持未知错误语义", () => {
  assert.match(productPut, /产品名称不能为空。[\s\S]*?status: 400/);
  assert.match(productPut, /parseStrictPositiveInteger\(body\.quantity, "产品数量"\)/);
  assert.match(productPut, /PositiveIntegerValidationError[\s\S]*?status: 400/);
  assert.match(productPut, /保存产品失败。[\s\S]*?status: 500/);
  assert.doesNotMatch(productPut, /P2025|status: 404/);
});
test("产品删除保持原关联检查范围和 409 文案", () => {
  for (const marker of [
    "prisma.partDrawing.count",
    "prisma.productPartProgressLog.count",
    "prisma.productPartAbnormal.count",
    "prisma.outsourceOrderItem.count",
    "prisma.outsourceReturnItem.count",
    "prisma.deliveryOrderItem.count",
    "prisma.productPart.count"
  ]) assert.match(productDelete, new RegExp(marker.replaceAll(".", "\\.")));
  assert.match(productDelete, /protectedProductDeleteMessage[\s\S]*?status: 409/);
});
test("产品删除保持普通部件清理事务和成功响应", () => {
  assert.match(productDelete, /prisma\.\$transaction\(\[\s*prisma\.productPart\.deleteMany\(\{ where: \{ productId: id \} \}\),\s*prisma\.product\.delete\(\{ where: \{ id \} \}\)\s*\]\)/);
  assert.match(productDelete, /NextResponse\.json\(\{ ok: true \}\)/);
});
test("产品删除继续保持显式检查位于原删除事务之前", () => {
  assertBefore(productDelete, "Promise.all", "prisma.$transaction");
  assert.doesNotMatch(productDelete, /interactive|Serializable|retry|locked/i);
});
test("产品删除使用 Prisma 运行时已知错误识别 P2025 和 P2003", () => {
  assert.match(source.productById, /import \{ Prisma \} from "@prisma\/client"/);
  assert.match(productDeleteCatch, /error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === "P2025"/);
  assert.match(productDeleteCatch, /error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === "P2003"/);
  assertBefore(productDeleteCatch, 'error.code === "P2025"', 'error.code === "P2003"');
});
test("产品删除 P2025 映射为稳定 404", () => {
  assert.match(productDeleteCatch, /error\.code === "P2025"[\s\S]*?产品不存在。[\s\S]*?status: 404/);
});
test("产品删除 P2003 复用显式冲突文案并映射 409", () => {
  assert.equal(occurrenceCount(productDelete, "protectedProductDeleteMessage"), 2);
  assert.match(productDeleteCatch, /error\.code === "P2003"[\s\S]*?error: protectedProductDeleteMessage[\s\S]*?status: 409/);
});
test("产品删除未知错误保持固定 500 且不泄露 Prisma 信息", () => {
  assert.match(productDeleteCatch, /删除产品失败。[\s\S]*?status: 500/);
  assert.doesNotMatch(productDeleteCatch, /error\.message|String\(error\)|errorMessage\(/);
  assert.doesNotMatch(productDeleteCatch, /\.meta|field_name|constraint|SQLite/i);
});
test("产品 PUT 与 DELETE 使用独立函数体和独立权限", () => {
  assert.doesNotMatch(productPut, /product\.delete|productPart\.deleteMany|product\.delete/);
  assert.doesNotMatch(productDelete, /product\.update|product\.update/);
  assert.doesNotMatch(productPut, /product\.delete/);
  assert.doesNotMatch(productDelete, /product\.update/);
});
test("部件写 route 统一导入全部权限助手且不再导入登录助手", () => {
  for (const content of [source.productParts, source.partById, source.wholePart]) {
    assert.match(content, /import \{ requireApiAllPermissions \} from "@\/lib\/auth\/authorization"/);
    assert.doesNotMatch(content, /requireApiUser/);
  }
});
test("普通部件创建精确要求父产品查看、部件查看和部件创建权限", () => {
  assert.match(productPartsPost, /requireApiAllPermissions\(\[\s*"product\.view",\s*"part\.view",\s*"part\.create"\s*\]\)/);
});
test("整件创建精确要求父产品查看、部件查看和部件创建权限", () => {
  assert.match(wholePartPost, /requireApiAllPermissions\(\[\s*"product\.view",\s*"part\.view",\s*"part\.create"\s*\]\)/);
});
test("部件更新精确要求部件查看和更新权限", () => {
  assert.match(partPatch, /requireApiAllPermissions\(\[\s*"part\.view",\s*"part\.update"\s*\]\)/);
});
test("部件删除精确要求部件查看和删除权限", () => {
  assert.match(partDelete, /requireApiAllPermissions\(\[\s*"part\.view",\s*"part\.delete"\s*\]\)/);
});
test("四个部件写接口权限失败后立即返回", () => {
  for (const handler of [productPartsPost, wholePartPost, partPatch, partDelete]) {
    assert.match(handler, /if \(!authResult\.ok\) return authResult\.response/);
  }
});
test("普通部件创建保持权限、params、JSON、父产品查询、字段数量处理和创建顺序", () => {
  assertBefore(productPartsPost, "requireApiAllPermissions", "await context.params");
  assertBefore(productPartsPost, "await context.params", "request.json()");
  assertBefore(productPartsPost, "request.json()", "prisma.product.findUnique");
  assertBefore(productPartsPost, "prisma.product.findUnique", "const partName");
  assertBefore(productPartsPost, "const partName", "const productQuantity");
  assertBefore(productPartsPost, "const productQuantity", "calculatePartTotalQuantity");
  assertBefore(productPartsPost, "calculatePartTotalQuantity", "prisma.productPart.create");
});
test("整件创建鉴权早于 params、父产品查询和创建", () => {
  for (const marker of ["await context.params", "prisma.product.findUnique", "prisma.productPart.create"]) {
    assertBefore(wholePartPost, "requireApiAllPermissions", marker);
  }
});
test("部件更新鉴权早于 params、JSON、目标查询和更新", () => {
  for (const marker of ["await context.params", "request.json()", "updateProductPartPlan"]) {
    assertBefore(partPatch, "requireApiAllPermissions", marker);
  }
});
test("部件删除鉴权早于 params、目标查询、关联检查和删除", () => {
  for (const marker of ["await context.params", "prisma.productPart.findUnique", "hasBusinessRecords", "prisma.productPart.delete"]) {
    assertBefore(partDelete, "requireApiAllPermissions", marker);
  }
});
test("普通部件创建保持现有字段、数量计算和成功响应", () => {
  for (const field of ["partName", "partCode", "specification", "material", "unitQuantity", "productQuantity", "surfaceTreatment", "color", "remark"]) {
    assert.match(productPartsPost, new RegExp(`body\\.${field}`));
  }
  assert.match(productPartsPost, /calculatePartTotalQuantity\(unitQuantity, productQuantity\)/);
  assert.match(productPartsPost, /status: "PENDING"/);
  assert.match(productPartsPost, /NextResponse\.json\(\{ part \}\)/);
});
test("整件创建保持现有检查、固定字段和成功响应", () => {
  assert.match(wholePartPost, /product\._count\.parts > 0/);
  assert.match(wholePartPost, /blockedProductStatuses\.has\(product\.status\)/);
  assert.match(wholePartPost, /partName: "整件"/);
  assert.match(wholePartPost, /unitQuantity: 1/);
  assert.match(wholePartPost, /productQuantity: product\.quantity/);
  assert.match(wholePartPost, /totalQuantity: product\.quantity/);
  assert.match(wholePartPost, /NextResponse\.json\(\{ success: true \}\)/);
});
test("部件更新保持字段白名单、数量计算和成功响应", () => {
  for (const field of ["partName", "partCode", "specification", "material", "unitQuantity", "productQuantity", "surfaceTreatment", "color", "remark"]) {
    assert.match(partPatch, new RegExp(`(?:body\\.${field}|\\b${field},)`));
  }
  assert.match(partPatch, /updateProductPartPlan\(prisma, id,/);
  assert.match(partPatch, /NextResponse\.json\(\{ part \}\)/);
});
test("数量完整性库不使用路径别名或全局 Prisma 实例", () => {
  assert.doesNotMatch(source.productPartIntegrity, /from "@\//);
  assert.doesNotMatch(source.productPartIntegrity, /@\/lib\/prisma|\bprisma\./);
  assert.match(source.productPartIntegrity, /client: PrismaClient/);
});
test("严格数量解析仅接受 number 或规范十进制正整数字符串", () => {
  assert.match(source.productPartIntegrity, /typeof value === "number"/);
  assert.match(source.productPartIntegrity, /typeof value === "string" && \/\^\[1-9\]\\d\*\$\//);
  assert.match(source.productPartIntegrity, /Number\.isInteger\(parsedValue\)/);
  assert.match(source.productPartIntegrity, /Number\.isSafeInteger\(parsedValue\)/);
  assert.match(source.productPartIntegrity, /parsedValue > PRISMA_INT_MAX/);
  assert.doesNotMatch(source.productPartIntegrity, /const (?:quantity|parsedValue) = Number\(value\)/);
});
test("普通部件仅在 productQuantity 属性缺失时采用父产品数量", () => {
  assert.match(productPartsPost, /body\.productQuantity === undefined \? product\.quantity : body\.productQuantity/);
  assert.doesNotMatch(productPartsPost, /body\.productQuantity === ""|body\.productQuantity == null/);
});
test("普通部件数量和总量验证错误返回400", () => {
  assert.match(productPartsPost, /PositiveIntegerValidationError[\s\S]*?ProductPartTotalQuantityValidationError[\s\S]*?status: 400/);
});
test("普通部件totalQuantity只由公共服务端函数计算", () => {
  assert.match(productPartsPost, /const totalQuantity = calculatePartTotalQuantity\(unitQuantity, productQuantity\)/);
  assert.match(productPartsPost, /totalQuantity,/);
  assert.doesNotMatch(productPartsPost, /body\.totalQuantity|\.\.\.body/);
});
test("部件计划服务在同一事务读取累计量并更新", () => {
  assert.match(source.productPartIntegrity, /client\.\$transaction\(async \(tx\) =>/);
  assertBefore(source.productPartIntegrity, "tx.productPart.findUnique", "tx.productPart.update");
  for (const field of ["outsourcedQuantity", "returnedQuantity"]) {
    assert.match(source.productPartIntegrity, new RegExp(`${field}: true`));
  }
});
test("部件计划服务校验已外发和已回已完成两项累计下限", () => {
  assert.match(source.productPartIntegrity, /totalQuantity < existingPart\.outsourcedQuantity/);
  assert.match(source.productPartIntegrity, /totalQuantity < existingPart\.returnedQuantity/);
  assert.match(source.productPartIntegrity, /部件总数量不能小于已外发数量或已回\/已完成数量。/);
});
test("部件PATCH数字错误400、累计冲突409且不存在保持404", () => {
  assert.match(partPatch, /PositiveIntegerValidationError[\s\S]*?ProductPartTotalQuantityValidationError[\s\S]*?status: 400/);
  assert.match(partPatch, /ProductPartPlanConflictError[\s\S]*?status: 409/);
  assert.match(partPatch, /ProductPartNotFoundError[\s\S]*?status: 404/);
});
test("部件计划更新不修改累计字段、missing或status", () => {
  const updateData = sourceSlice(source.productPartIntegrity, "data: {", "\n      }\n    });");
  for (const field of ["outsourcedQuantity", "returnedQuantity", "missingQuantity", "status"]) {
    assert.doesNotMatch(updateData, new RegExp(`${field}\\s*:`));
  }
  assert.doesNotMatch(updateData, /\.\.\.input/);
});
test("部件 DELETE 显式关联冲突统一为 409 且原文案逐字保持", () => {
  assert.match(
    partDelete,
    new RegExp(`if \\(hasBusinessRecords\\)[\\s\\S]*?${escapeRegExp(partDeleteBusinessConflictMessage)}[\\s\\S]*?status: 409`)
  );
});
test("部件 DELETE 使用 Prisma 运行时已知错误识别 P2025 和 P2003", () => {
  assert.match(source.partById, /import \{ Prisma \} from "@prisma\/client"/);
  assert.match(partDeleteCatch, /error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === "P2025"/);
  assert.match(partDeleteCatch, /error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === "P2003"/);
  assertBefore(partDeleteCatch, 'error.code === "P2025"', 'error.code === "P2003"');
});
test("部件 DELETE P2025 映射为稳定 404", () => {
  assert.match(partDeleteCatch, /error\.code === "P2025"[\s\S]*?\\u90e8\\u4ef6\\u4e0d\\u5b58\\u5728[\s\S]*?status: 404/);
});
test("部件 DELETE P2003 映射 409 且原文案逐字保持", () => {
  assert.match(
    partDeleteCatch,
    new RegExp(`error\\.code === "P2003"[\\s\\S]*?${escapeRegExp(partDeleteForeignKeyConflictMessage)}[\\s\\S]*?status: 409`)
  );
});
test("部件 DELETE 保留两套独立冲突文案", () => {
  assert.match(partDelete, new RegExp(escapeRegExp(partDeleteBusinessConflictMessage)));
  assert.match(partDeleteCatch, new RegExp(escapeRegExp(partDeleteForeignKeyConflictMessage)));
  assert.notEqual(partDeleteBusinessConflictMessage, partDeleteForeignKeyConflictMessage);
});
test("部件 DELETE 保持不存在、成功和未知错误语义", () => {
  assert.match(partDelete, /\\u90e8\\u4ef6\\u4e0d\\u5b58\\u5728" \}, \{ status: 404 \}/);
  assert.match(partDelete, /NextResponse\.json\(\{ success: true \}\)/);
  assert.match(partDeleteCatch, /\\u5220\\u9664\\u90e8\\u4ef6\\u5931\\u8d25" \}, \{ status: 500 \}/);
  assert.doesNotMatch(partDeleteCatch, /error\.message|String\(error\)|errorMessage\(/);
  assert.doesNotMatch(partDeleteCatch, /\.meta|field_name|constraint|SQLite/i);
});
test("部件 DELETE 保持关联检查范围且不引入事务或 TOCTOU 加固", () => {
  for (const relation of ["drawings", "outsourceItems", "outsourceReturnItems"]) {
    assert.match(partDelete, new RegExp(`${relation}: true`));
  }
  assert.doesNotMatch(partDelete, /progressLogs|abnormals|productPartProgressLog|productPartAbnormal/);
  assert.doesNotMatch(partDelete, /\$transaction|interactive|Serializable/);
  assertBefore(partDelete, "hasBusinessRecords", "prisma.productPart.delete");
});
test("GET 权限 allowlist 继续精确保持十四条", () => {
  const match = /const permittedRoutes = new Set\(\[([\s\S]*?)\]\);/.exec(source.pagePermissionTests);
  assert.ok(match);
  assert.equal([...match[1].matchAll(/"[^"\n]+\/route\.ts"/g)].length, 14);
});

test("图纸 Schema 存在 partId 与 version 复合唯一约束", () => {
  assert.match(source.schema, /@@unique\(\[partId, version\], map: "PartDrawing_partId_version_key"\)/);
});

test("图纸版本唯一约束映射名称保持稳定", () => {
  assert.equal(occurrenceCount(source.schema, 'map: "PartDrawing_partId_version_key"'), 1);
});

test("新 migration 只创建图纸版本唯一索引", () => {
  assert.equal(
    source.drawingVersionMigration.trim(),
    'CREATE UNIQUE INDEX "PartDrawing_partId_version_key"\nON "PartDrawing"("partId", "version");'
  );
});

test("新 migration 不重建表或修改业务数据", () => {
  assert.doesNotMatch(source.drawingVersionMigration, /\b(?:CREATE TABLE|DROP TABLE|ALTER TABLE|UPDATE|DELETE|INSERT)\b/i);
  assert.equal(occurrenceCount(source.drawingVersionMigration, ";"), 1);
});

test("版本数据库创建最多尝试三次", () => {
  assert.match(source.drawingUploadIntegrity, /MAX_VERSION_CREATE_ATTEMPTS = 3/);
  assert.match(versionRetryLoop, /versionConflictAttempts < MAX_VERSION_CREATE_ATTEMPTS/);
});

test("每次版本创建尝试都重新查询该 partId 最大版本", () => {
  assert.match(versionRetryLoop, /partDrawing\.findFirst\(\{\s*where: \{ partId: part\.id \},\s*orderBy: \{ version: "desc" \}/);
  assert.equal(occurrenceCount(versionRetryLoop, "orderBy: { version: \"desc\" }"), 1);
});

test("最大版本查询不按 status 过滤并包含全部历史状态", () => {
  const maxQuery = sourceSlice(versionRetryLoop, "client.partDrawing.findFirst", "\n      const startVersion");
  assert.doesNotMatch(maxQuery, /status|isMain|createdAt/);
});

test("新批起始版本严格为历史 max 加一", () => {
  assert.match(versionRetryLoop, /const startVersion = \(latestDrawing\?\.version \?\? 0\) \+ 1/);
});

test("同批文件按原顺序连续规划版本", () => {
  assert.match(versionRetryLoop, /savedFiles\.map\(\(_savedFile, index\) => startVersion \+ index\)/);
  assert.match(versionRetryLoop, /version: versions\[index\]/);
});

test("版本规划不使用 count、createdAt 或空缺补号", () => {
  const planning = sourceSlice(versionRetryLoop, "const latestDrawing", "await dependencies?.beforeVersionCreateAttempt");
  assert.doesNotMatch(planning, /\.count\(|createdAt|findMany|Math\.min/);
});

test("OBSOLETE 版本不会从最大值查询中排除", () => {
  assert.doesNotMatch(versionRetryLoop, /NOT:\s*\{\s*status:\s*"OBSOLETE"|status:\s*\{\s*not:\s*"OBSOLETE"/);
});

test("数据库创建没有使用 skipDuplicates", () => {
  assert.doesNotMatch(source.drawingUploadIntegrity, /skipDuplicates/);
});

test("P2002 使用 Prisma 运行时已知错误与精确 code 识别", () => {
  assert.match(source.drawingUploadIntegrity, /error instanceof Prisma\.PrismaClientKnownRequestError && error\.code === "P2002"/);
});

test("P2002 前两次继续重试且第三次耗尽", () => {
  assert.match(versionRetryLoop, /versionConflictAttempts \+= 1/);
  assert.match(versionRetryLoop, /if \(versionConflictAttempts < MAX_VERSION_CREATE_ATTEMPTS\) continue/);
  assert.match(versionRetryLoop, /throw new DrawingUploadError\(409, "图纸版本冲突，请重新上传。", error\)/);
});

test("P2002 耗尽返回精确 409 文案", () => {
  assert.equal(occurrenceCount(source.drawingUploadIntegrity, "图纸版本冲突，请重新上传。"), 1);
  assert.match(source.drawingUploadIntegrity, /DrawingUploadError\(409, "图纸版本冲突，请重新上传。"/);
});

test("文件预验证位于版本重试循环之外", () => {
  assertBefore(
    source.drawingUploadIntegrity,
    "prevalidateDrawingFiles(files, dependencies)",
    "while (versionConflictAttempts < MAX_VERSION_CREATE_ATTEMPTS)"
  );
});

test("原图与缩略图保存位于版本重试循环之外", () => {
  assertBefore(
    source.drawingUploadIntegrity,
    "savedFiles.push(await savePreparedDrawingFile",
    "while (versionConflictAttempts < MAX_VERSION_CREATE_ATTEMPTS)"
  );
  assert.doesNotMatch(versionRetryLoop, /savePreparedDrawingFile|writeOriginal|createThumbnail|randomUUID|sharp\(/);
});

test("重试期间不重新读取客户端文件或运行 Sharp metadata", () => {
  assert.doesNotMatch(versionRetryLoop, /arrayBuffer|validateImage|metadata\(\)/);
});

test("重试钩子位于版本规划后且数据库事务前", () => {
  assertBefore(versionRetryLoop, "const versions =", "beforeVersionCreateAttempt");
  assertBefore(versionRetryLoop, "beforeVersionCreateAttempt", "client.$transaction");
});

test("最终数据库失败统一清理本批已保存文件", () => {
  assert.match(source.drawingUploadIntegrity, /catch \(error\) \{\s*await deleteSavedDrawingFiles\(savedFiles, storageRoot\);\s*throw error/);
});

test("P2003 保持 404 部件不存在且不进入 P2002 重试", () => {
  assert.match(versionRetryLoop, /isPrismaForeignKeyError\(error\)[\s\S]*?DrawingUploadError\(404, "部件不存在。", error\)/);
  assertBefore(versionRetryLoop, "isPrismaUniqueConstraintError(error)", "isPrismaForeignKeyError(error)");
});

test("其他数据库错误保持 500 保存图纸记录失败", () => {
  assert.match(versionRetryLoop, /throw new DrawingUploadError\(500, "保存图纸记录失败。", error\)/);
});

test("主图 existingCount 读取位置和既有规则保持", () => {
  assert.match(source.drawingUploadIntegrity, /const existingCount = await client\.partDrawing\.count\(\{ where: \{ partId: part\.id \} \}\)/);
  assert.match(source.drawingUploadIntegrity, /let plansMainDrawing = existingCount === 0/);
  assert.match(versionRetryLoop, /isMain: plansMainDrawing && index === 0/);
  assertBefore(source.drawingUploadIntegrity, "const existingCount =", "savedFiles.push(await savePreparedDrawingFile");
});

test("上传 Route 内容保持原 SHA-256", () => {
  assert.equal(sourceHash(source.partsDrawings), "CF91D65AA27FE522A2C958CC8648345A9405E657145391E1B5928F6EC72E9A10");
});

test("PATCH 与 DELETE Route 内容保持原 SHA-256", () => {
  assert.equal(sourceHash(source.drawingWrite), "A3E9DBAB5A51BC8826090265D2B67F415E27A9BF96BCB99D4EAD9A95DE01A50B");
});

test("设主图 Route 委托独立完整性服务", () => {
  assert.match(source.drawingMain, /import \{ DrawingMainError, setMainDrawing \} from "@\/lib\/drawing-main-integrity"/);
  assert.match(drawingMainPost, /setMainDrawing\(\{ drawingId: id, client: prisma \}\)/);
});

test("既有 drawing-files 工具内容保持原 SHA-256", () => {
  assert.equal(sourceHash(source.drawingFiles), "414046A869AEE95E499D63564043C1912ADA18EA004CCB8F45E391D49455EC43");
});

test("C3d-2 安全限制和缩略图降级方案 A 保持", () => {
  for (const marker of [
    "MAX_DRAWING_FILE_SIZE = 50 * 1024 * 1024",
    "MAX_DRAWING_FILE_COUNT = 20",
    "MAX_DRAWING_REQUEST_SIZE = 200 * 1024 * 1024",
    'uploadStatus: "THUMBNAIL_FAILED"',
    'errorMessage: "缩略图生成失败。"'
  ]) {
    assert.match(source.drawingUploadIntegrity, new RegExp(escapeRegExp(marker)));
  }
});

test("图纸版本阶段没有引入 P2034 或 SQLite 锁重试", () => {
  assert.doesNotMatch(source.drawingUploadIntegrity, /P2034|SQLITE_BUSY|database is locked|busy_timeout/i);
});

test("Schema 没有新增主图唯一索引", () => {
  assert.doesNotMatch(source.schema, /@@unique\(\[[^\]]*isMain/);
});

test("主图 migration 精确创建 SQLite 部分唯一索引", () => {
  assert.equal(
    source.drawingMainMigration.trim(),
    'CREATE UNIQUE INDEX "PartDrawing_partId_main_key"\nON "PartDrawing"("partId")\nWHERE "isMain" = 1;'
  );
});

test("主图 migration 只包含一个无业务数据变更的 SQL 操作", () => {
  assert.equal(occurrenceCount(source.drawingMainMigration, ";"), 1);
  assert.doesNotMatch(source.drawingMainMigration, /\b(?:CREATE TABLE|DROP TABLE|ALTER TABLE|UPDATE|DELETE|INSERT|PRAGMA)\b/i);
});

test("Schema SHA-256 保持 C3d-3b 基线", () => {
  assert.equal(sourceHash(source.schema), "9EE8DCA5EC5A1DE8B11F7A16A607BE900A8C563F424933021C8A49AB64BCAAE5");
});

test("上传主图冲突只在本批计划主图且尚未降级时检查", () => {
  assert.match(versionRetryLoop, /if \(plansMainDrawing && !mainDrawingDowngraded\)/);
});

test("上传主图冲突通过数据库已有同部件主图确认", () => {
  assert.match(versionRetryLoop, /where: \{ partId: part\.id, isMain: true \}/);
  assert.match(versionRetryLoop, /if \(existingMainDrawing\)/);
});

test("主图冲突将整批规划降级且最多一次", () => {
  assert.match(versionRetryLoop, /plansMainDrawing = false/);
  assert.match(versionRetryLoop, /mainDrawingDowngraded = true/);
  assert.equal(occurrenceCount(versionRetryLoop, "mainDrawingDowngraded = true"), 1);
});

test("主图降级不增加版本冲突计数", () => {
  assertBefore(versionRetryLoop, "mainDrawingDowngraded = true", "versionConflictAttempts += 1");
  const downgrade = sourceSlice(versionRetryLoop, "if (existingMainDrawing)", "\n          }\n          versionConflictAttempts");
  assert.doesNotMatch(downgrade, /versionConflictAttempts\s*\+=/);
});

test("主图降级后继续循环并重新查询最大版本", () => {
  assert.match(versionRetryLoop, /mainDrawingDowngraded = true;\s*continue/);
  assertBefore(versionRetryLoop, "while (versionConflictAttempts", "orderBy: { version: \"desc\" }");
});

test("主图降级循环不重新处理文件、Sharp 或 UUID", () => {
  assert.doesNotMatch(versionRetryLoop, /savePreparedDrawingFile|arrayBuffer|metadata\(\)|sharp\(|randomUUID|writeOriginal|createThumbnail/);
});

test("独立主图服务不依赖全局 Prisma 或 Next 运行时", () => {
  assert.doesNotMatch(source.drawingMainIntegrity, /@\/lib\/prisma|NextResponse|next\/server|process\.env/);
});

test("独立主图服务固定最多三次事务尝试", () => {
  assert.match(source.drawingMainIntegrity, /MAX_MAIN_SWITCH_ATTEMPTS = 3/);
  assert.match(source.drawingMainIntegrity, /attempt <= MAX_MAIN_SWITCH_ATTEMPTS/);
});

test("主图事务严格按查询、状态检查、清空、设置顺序", () => {
  assertBefore(source.drawingMainIntegrity, "partDrawing.findUnique", 'drawing.status === "OBSOLETE"');
  assertBefore(source.drawingMainIntegrity, 'drawing.status === "OBSOLETE"', "partDrawing.updateMany");
  assertBefore(source.drawingMainIntegrity, "transaction.partDrawing.updateMany", "return transaction.partDrawing.update({");
});

test("主图服务 P2002 稳定映射 409 且不按锁重试", () => {
  assert.match(source.drawingMainIntegrity, /isKnownPrismaError\(error, "P2002"\)[\s\S]*?DrawingMainError\(409, "主图切换冲突，请重试。"/);
  assertBefore(source.drawingMainIntegrity, 'isKnownPrismaError(error, "P2002")', "isTransientSqliteLock(error)");
});

test("主图服务锁冲突耗尽稳定映射 503", () => {
  assert.match(source.drawingMainIntegrity, /attempt === MAX_MAIN_SWITCH_ATTEMPTS[\s\S]*?DrawingMainError\(503, "主图切换繁忙，请稍后重试。"/);
});

test("SQLite busy 识别严格限制为 UnknownRequestError", () => {
  assert.match(source.drawingMainIntegrity, /error instanceof Prisma\.PrismaClientUnknownRequestError/);
  assert.match(source.drawingMainIntegrity, /SQLITE_BUSY.*database is locked/);
});

test("当前 SQLite 运行时 P1008 仅按精确 timeout 文案识别", () => {
  assert.match(source.drawingMainIntegrity, /isKnownPrismaError\(error, "P1008"\)/);
  assert.match(source.drawingMainIntegrity, /Socket timeout.*database failed to respond to a query within the configured timeout/);
});

test("主图服务 P2025、缺失和作废语义稳定", () => {
  assert.match(source.drawingMainIntegrity, /DrawingMainError\(404, "图纸不存在。"/);
  assert.match(source.drawingMainIntegrity, /DrawingMainError\(400, "已作废图纸不能设为主图。"/);
  assert.match(source.drawingMainIntegrity, /isKnownPrismaError\(error, "P2025"\)/);
});

test("设主图 Route 权限仍精确为 drawing.view 与 drawing.setMain", () => {
  assert.match(drawingMainPost, /requireApiAllPermissions\(\[\s*"drawing\.view",\s*"drawing\.setMain"\s*\]\)/);
  assert.doesNotMatch(drawingMainPost, /part\.view/);
});

test("设主图 Route 权限早于 params 和服务调用", () => {
  assertBefore(drawingMainPost, "requireApiAllPermissions", "await context.params");
  assertBefore(drawingMainPost, "requireApiAllPermissions", "setMainDrawing");
});

test("设主图 Route 统一映射稳定业务错误并保留未知 500", () => {
  assert.match(drawingMainPost, /error instanceof DrawingMainError/);
  assert.match(drawingMainPost, /error: error\.message \}, \{ status: error\.status/);
  assert.match(drawingMainPost, /error: "设置主图失败。" \}, \{ status: 500/);
});

test("设主图实际 HTTP 方法仍为 POST", () => {
  assert.match(source.drawingMain, /export async function POST\(/);
  assert.doesNotMatch(source.drawingMain, /export async function (?:PATCH|DELETE)\(/);
});

test("生产齐套完整性服务导出五项批准操作", () => {
  for (const name of ["advancePartProduction", "reportPartAbnormal", "resolvePartAbnormal", "markProductProductionComplete", "refreshKittingState"]) {
    assert.match(source.productionKittingIntegrity, new RegExp(`export async function ${name}`));
  }
});
test("完整性服务不导入全局 prisma、NextResponse 或环境测试开关", () => {
  assert.doesNotMatch(source.productionKittingIntegrity, /@\/lib\/prisma|NextResponse|process\.env/);
});
test("完整性服务固定最多三次完整事务", () => {
  assert.match(source.productionKittingIntegrity, /MAX_PRODUCTION_WRITE_ATTEMPTS = 3/);
  assert.match(source.productionKittingIntegrity, /attempt <= MAX_PRODUCTION_WRITE_ATTEMPTS/);
});
test("P2034 被严格识别为瞬态并发错误", () => {
  assert.match(source.productionKittingIntegrity, /isKnownPrismaError\(error, "P2034"\)/);
});
test("P1008 同时要求 SQLite socket-timeout 特征", () => {
  assert.match(source.productionKittingIntegrity, /isKnownPrismaError\(error, "P1008"\)[\s\S]*?Socket timeout/);
  assert.match(source.productionKittingIntegrity, /database failed to respond to a query within the configured timeout/);
});
test("未知请求只接受 SQLITE_BUSY 或 database is locked", () => {
  assert.match(source.productionKittingIntegrity, /PrismaClientUnknownRequestError/);
  assert.match(source.productionKittingIntegrity, /SQLITE_BUSY.*database is locked/);
});
test("P2002、P2003 和 P2025 不进入锁重试", () => {
  assert.match(source.productionKittingIntegrity, /P2002[\s\S]*?P2003[\s\S]*?P2025[\s\S]*?throw concurrentStateError/);
  assertBefore(source.productionKittingIntegrity, 'isKnownPrismaError(error, "P2025")', "isTransientProductionSqliteError(error)");
});
test("锁耗尽返回精确 503 文案", () => {
  assert.match(source.productionKittingIntegrity, /ProductionKittingError\(503, "系统繁忙，请稍后重试。"/);
});
test("未知错误统一为稳定 500", () => {
  assert.match(source.productionKittingIntegrity, /ProductionKittingError\(500, "操作失败，请稍后重试。"/);
});
test("推进读取并比对 expectedStatus", () => {
  assert.match(source.productionKittingIntegrity, /part\.status !== expectedStatus/);
});
test("推进条件更新同时包含 id 和 expectedStatus", () => {
  assert.match(source.productionKittingIntegrity, /productPart\.updateMany\(\{[\s\S]*?id: part\.id,[\s\S]*?status: expectedStatus/);
});
test("推进条件更新 count 失败映射 409", () => {
  assert.match(source.productionKittingIntegrity, /if \(update\.count !== 1\) throw concurrentStateError\(\)/);
});
test("推进成功后才创建 ProgressLog", () => {
  assertBefore(source.productionKittingIntegrity, "if (update.count !== 1) throw concurrentStateError()", "productPartProgressLog.create");
});
test("推进拒绝 COMPLETED 订单", () => {
  assert.match(source.productionKittingIntegrity, /part\.order\.status === "COMPLETED"[\s\S]*?已完成订单不能执行生产操作。/);
});
test("推进不修改三个数量字段", () => {
  const block = sourceSlice(source.productionKittingIntegrity, "export async function advancePartProduction", "export async function reportPartAbnormal");
  assert.doesNotMatch(block, /returnedQuantity|missingQuantity|outsourcedQuantity/);
});
test("产品状态纯推导保护部分送货和完成", () => {
  assert.match(source.productProgress, /deliveryControlledStatuses[\s\S]*?"PARTIAL_DELIVERED", "COMPLETED"/);
  assert.match(source.productProgress, /calculateProtectedProductStatus/);
});
test("订单状态纯推导保护部分送货和完成", () => {
  assert.match(source.productProgress, /deliveryControlledOrderStatuses[\s\S]*?"PARTIAL_DELIVERED", "COMPLETED"/);
  assert.match(source.productProgress, /calculateOrderStatusFromProducts/);
});
test("登记异常先查询 OPEN 异常", () => {
  const block = sourceSlice(source.productionKittingIntegrity, "export async function reportPartAbnormal", "export async function resolvePartAbnormal");
  assert.match(block, /productPartAbnormal\.findFirst[\s\S]*?status: "OPEN"/);
});
test("登记异常的 ABNORMAL 和重复 OPEN 均返回 409", () => {
  const block = sourceSlice(source.productionKittingIntegrity, "export async function reportPartAbnormal", "export async function resolvePartAbnormal");
  assert.equal(occurrenceCount(block, "该部件已有未处理异常。"), 2);
});
test("登记异常先条件更新 Part 再创建异常", () => {
  const block = sourceSlice(source.productionKittingIntegrity, "export async function reportPartAbnormal", "export async function resolvePartAbnormal");
  assertBefore(block, "productPart.updateMany", "productPartAbnormal.create");
  assertBefore(block, "if (partUpdate.count !== 1)", "productPartAbnormal.create");
});
test("登记异常保存真实旧状态为 fromStatus", () => {
  assert.match(source.productionKittingIntegrity, /fromStatus: part\.status/);
});
test("处理异常恢复目标固定来自 fromStatus", () => {
  const block = sourceSlice(source.productionKittingIntegrity, "export async function resolvePartAbnormal", "export async function markProductProductionComplete");
  assert.match(block, /status: abnormal\.fromStatus/);
});
test("旧 Client 不同恢复状态被稳定拒绝", () => {
  assert.match(source.productionKittingIntegrity, /requestedStatus !== abnormal\.fromStatus[\s\S]*?异常只能恢复到登记前状态。/);
});
test("处理异常同时条件更新异常和 Part", () => {
  const block = sourceSlice(source.productionKittingIntegrity, "export async function resolvePartAbnormal", "export async function markProductProductionComplete");
  assert.match(block, /productPartAbnormal\.updateMany/);
  assert.match(block, /productPart\.updateMany/);
});
test("处理异常两个条件更新都校验 count", () => {
  const block = sourceSlice(source.productionKittingIntegrity, "export async function resolvePartAbnormal", "export async function markProductProductionComplete");
  assert.match(block, /abnormalUpdate\.count !== 1/);
  assert.match(block, /partUpdate\.count !== 1/);
});
test("未外发快速完成写 returned=total 和 missing=0", () => {
  const block = sourceSlice(source.productionKittingIntegrity, "export async function markProductProductionComplete", "export async function refreshKittingState");
  assert.match(block, /isNeverOutsourced[\s\S]*?returnedQuantity: part\.totalQuantity,[\s\S]*?missingQuantity: 0/);
});
test("已外发部件要求真实全部回厂", () => {
  assert.match(source.productionKittingIntegrity, /part\.returnedQuantity < part\.totalQuantity[\s\S]*?part\.missingQuantity !== 0[\s\S]*?part\.returnedQuantity < part\.outsourcedQuantity/);
});
test("已外发快速完成只更新状态", () => {
  assert.match(source.productionKittingIntegrity, /: \{\s*status: "RETURNED"\s*\}/);
});
test("快速完成条件快照包含全部数量和状态字段", () => {
  const block = sourceSlice(source.productionKittingIntegrity, "export async function markProductProductionComplete", "export async function refreshKittingState");
  for (const marker of ["status: part.status", "totalQuantity: part.totalQuantity", "outsourcedQuantity: part.outsourcedQuantity", "returnedQuantity: part.returnedQuantity", "missingQuantity: part.missingQuantity"]) {
    assert.match(block, new RegExp(escapeRegExp(marker)));
  }
});
test("快速完成不写 outsourcedQuantity", () => {
  const block = sourceSlice(source.productionKittingIntegrity, "data: isNeverOutsourced", "if (update.count !== 1)");
  assert.doesNotMatch(block, /outsourcedQuantity/);
});
test("快速完成拒绝未处理异常", () => {
  assert.match(source.productionKittingIntegrity, /产品仍有未处理异常，不能标记生产完成。/);
});
test("快速完成保护送货状态产品", () => {
  assert.match(source.productionKittingIntegrity, /deliveryControlledProductStatuses\.has\(product\.status\)/);
});
test("齐套结果计入 OPEN 异常", () => {
  assert.match(source.kittingLib, /calculateKittingResult\(product: KittingProduct, hasOpenAbnormal = false\)/);
  assert.match(source.kittingLib, /hasOpenAbnormal \|\| product\.status === "ABNORMAL"/);
});
test("齐套失败支持 WAIT_DELIVERY 回退", () => {
  assert.match(source.productionKittingIntegrity, /product\.status === "WAIT_DELIVERY"[\s\S]*?calculateKittingRollbackStatus/);
});
test("齐套回退纯函数按真实数量识别部分回厂", () => {
  assert.match(source.kittingLib, /calculateKittingRollbackStatus/);
  assert.match(source.kittingLib, /returnedQuantity > 0[\s\S]*?return "PARTIAL_RETURN"/);
});
test("齐套 Product 更新使用旧状态条件和 count", () => {
  const block = source.productionKittingIntegrity.slice(source.productionKittingIntegrity.indexOf("export async function refreshKittingState"));
  assert.match(block, /product\.updateMany\(\{[\s\S]*?status: product\.status/);
  assert.match(block, /productUpdate\.count !== 1/);
});
test("订单同步使用旧状态条件和 count", () => {
  assert.match(source.productionKittingIntegrity, /order\.updateMany\(\{[\s\S]*?status: order\.status/);
  assert.match(source.productionKittingIntegrity, /if \(update\.count !== 1\) throw concurrentStateError/);
});
test("五个写 Route 全部停止通用 error.message 回显", () => {
  for (const route of [source.partAdvance, source.partAbnormal, source.partAbnormalResolve, source.productionComplete]) {
    assert.doesNotMatch(route, /error instanceof Error \? error\.message|errorMessage\(/);
  }
  assert.doesNotMatch(kittingPost, /errorMessage\(/);
});
test("完整性服务稳定错误不向响应暴露 cause", () => {
  assert.match(source.productionKittingIntegrity, /readonly cause\?: unknown/);
  for (const route of [source.partAdvance, source.partAbnormal, source.partAbnormalResolve, source.productionComplete]) {
    assert.doesNotMatch(route, /json\(\{[^}]*cause/);
  }
});
test("完整性服务数量写入仅属于未外发快速完成", () => {
  assert.equal(occurrenceCount(source.productionKittingIntegrity, "returnedQuantity: part.totalQuantity"), 1);
  assert.equal(occurrenceCount(source.productionKittingIntegrity, "missingQuantity: 0"), 1);
});

test("API 静态测试仍不连接数据库、不启动服务或写文件", () => {
  const blocked = ["@prisma" + "/client", "write" + "File", "append" + "File", "fetch" + "(", "spawn" + "("];
  for (const marker of blocked) assert.equal(source.self.includes(marker), false, `测试脚本不得包含 ${marker}`);
});
