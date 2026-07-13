import assert from "node:assert/strict";
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
  productParts: await readSource("src", "app", "api", "products", "[id]", "parts", "route.ts"),
  backupList: await readSource("src", "app", "api", "system", "backup", "list", "route.ts"),
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

test("parts drawings route 同时导入两种鉴权助手", () => {
  assert.match(source.partsDrawings, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/);
  assert.match(source.partsDrawings, /import \{ requireApiUser \} from "@\/lib\/auth\/api-user"/);
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

test("parts drawings POST 仍使用 requireApiUser", () => {
  assert.match(partsPost, /requireApiUser\(\)/);
});

test("parts drawings POST 未接入 requireApiPermission", () => {
  assert.doesNotMatch(partsPost, /requireApiPermission/);
});

test("parts drawings POST 保留上传与写入关键代码", () => {
  assert.match(partsPost, /request\.formData\(\)/);
  assert.match(partsPost, /saveDrawingFile\(/);
  assert.match(partsPost, /prisma\.partDrawing\.create/);
});

test("parts drawings GET 与 POST 使用不同鉴权策略", () => {
  assert.match(partsGet, /requireApiPermission/);
  assert.match(partsPost, /requireApiUser/);
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

test("图纸 PATCH 与 DELETE 写接口未在 C2a 接入权限助手", () => {
  assert.match(source.drawingWrite, /export async function PATCH/);
  assert.match(source.drawingWrite, /export async function DELETE/);
  assert.doesNotMatch(source.drawingWrite, /requireApiPermission/);
});

test("设主图写接口未在 C2a 接入权限助手", () => {
  assert.match(source.drawingMain, /export async function POST/);
  assert.doesNotMatch(source.drawingMain, /requireApiPermission/);
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

test("图纸写接口仍未接入 C2 权限", () => {
  assert.doesNotMatch(source.drawingWrite, /requireApiPermission/);
  assert.doesNotMatch(source.drawingMain, /requireApiPermission/);
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
  assert.match(source.outsourcing, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/);
});
test("外发列表 GET 只要求 outsource.view", () => {
  assert.equal(occurrenceCount(outsourcingGet, 'requireApiPermission("outsource.view")'), 1);
  assert.doesNotMatch(outsourcingGet, /outsource\.create/);
});
test("外发列表 GET 鉴权早于 Prisma 和响应构造", () => {
  assertBefore(outsourcingGet, 'requireApiPermission("outsource.view")', "prisma.outsourceOrder.findMany");
  assertBefore(outsourcingGet, 'requireApiPermission("outsource.view")', "NextResponse.json({ outsourceOrders })");
});
test("外发列表 POST 保持 requireApiUser 认证", () => {
  assert.match(outsourcingPost, /requireApiUser\(\)/);
  assert.doesNotMatch(outsourcingPost, /requireApiPermission/);
});
test("外发列表 POST 保留编号、事务和数量联动", () => {
  assert.match(outsourcingPost, /prisma\.\$transaction/);
  assert.match(outsourcingPost, /const outsourceNo =/);
  assert.match(outsourcingPost, /outsourcedQuantity/);
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
test("本阶段未虚假接入齐套和产品部件读取 API", () => {
  assert.doesNotMatch(source.kitting, /requireApiPermission/);
  assert.doesNotMatch(source.productParts, /requireApiPermission/);
});
test("本阶段未虚假接入备份读取 API", () => {
  assert.doesNotMatch(source.backupList, /requireApiPermission/);
});
