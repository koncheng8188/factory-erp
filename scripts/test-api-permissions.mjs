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
  backupCreate: await readSource("src", "app", "api", "system", "backup", "route.ts"),
  importTemplate: await readSource("src", "app", "api", "imports", "excel", "template", "route.ts"),
  simpleTemplate: await readSource("src", "app", "api", "imports", "excel", "simple-template", "route.ts"),
  orderImportTemplate: await readSource("src", "app", "api", "orders", "[id]", "import-products", "template", "route.ts"),
  customers: await readSource("src", "app", "api", "customers", "route.ts"),
  customerById: await readSource("src", "app", "api", "customers", "[id]", "route.ts"),
  orders: await readSource("src", "app", "api", "orders", "route.ts"),
  orderById: await readSource("src", "app", "api", "orders", "[id]", "route.ts"),
  writeRegistry: await readSource("scripts", "test-write-permissions.mjs"),
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
test("齐套和产品部件 GET 不会额外接入写权限", () => {
  assert.doesNotMatch(kittingGet, /kitting\.execute/);
  assert.doesNotMatch(productPartsGet, /product\.update|part\.create/);
});
test("备份创建 route 尚未虚假接入读取权限", () => {
  assert.doesNotMatch(source.backupCreate, /requireApi(?:Any|All)?Permission/);
});

test("齐套 route 导入统一 API 权限助手", () => {
  assert.match(source.kitting, /import \{ requireApiPermission \} from "@\/lib\/auth\/authorization"/);
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
test("齐套 POST 保持 requireApiUser 认证", () => {
  assert.match(kittingPost, /requireApiUser\(\)/);
  assert.doesNotMatch(kittingPost, /requireApiPermission/);
});
test("齐套 POST 保留事务与刷新逻辑", () => {
  assert.match(kittingPost, /prisma\.\$transaction/);
  assert.match(kittingPost, /refreshProductKittingStatus/);
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
test("产品部件 POST 保持 requireApiUser 认证", () => {
  assert.match(productPartsPost, /requireApiUser\(\)/);
  assert.doesNotMatch(productPartsPost, /requireApiAllPermissions/);
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
  const forbiddenDatabase = new RegExp(`Prisma${"Client"}|@/lib/${"prisma"}`);
  const forbiddenWrites = [
    new RegExp(`w${"rite"}File\\s*\\(`),
    new RegExp(`a${"ppend"}File\\s*\\(`),
    new RegExp(`m${"kdir"}\\s*\\(`)
  ];
  assert.doesNotMatch(source.self, forbiddenDatabase);
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
test("C3b-1 写权限登记包含客户和订单六个 protected 接口", () => {
  assert.match(source.writeRegistry, /const protectedHandlers = new Map/);
  assert.match(source.writeRegistry, /assert\.equal\(protectedHandlers\.size, 6\)/);
  assert.match(source.writeRegistry, /assert\.equal\(pendingHandlers\.size, 26\)/);
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
  for (const marker of ["request.json()", "prisma.customer.findUnique", "generateOrderNo", "prisma.order.create"]) assertBefore(orderPost, "requireApiAllPermissions", marker);
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
  assert.match(orderPost, /status: "PENDING"/);
  assert.doesNotMatch(orderPost, /body\.status/);
  assert.match(orderPost, /NextResponse\.json\(\{ order \}\)/);
});
test("订单 PUT 保持字段白名单且 status 当前仍可更新", () => {
  for (const field of ["customerId", "orderDate", "deliveryDate", "status", "remark"]) assert.match(orderPut, new RegExp(`body\\.${field}`));
  assert.match(orderPut, /customerName: customer\.name/);
  assert.match(orderPut, /NextResponse\.json\(\{ order \}\)/);
});
test("订单 PUT 和 DELETE 将 Prisma P2025 映射为 404", () => {
  assert.match(source.orderById, /error\.code === "P2025"/);
  for (const handler of [orderPut, orderDelete]) assert.match(handler, /isRecordNotFoundError\(error\)[\s\S]*?订单不存在。[\s\S]*?status: 404/);
});
test("订单 DELETE 显式不存在检查继续返回 404", () => assert.match(orderDelete, /if \(!order\)[\s\S]*?订单不存在。[\s\S]*?status: 404/));
test("订单 DELETE 关联冲突保持中文文案和 409", () => assert.match(orderDelete, /protectedOrderDeleteMessage[\s\S]*?status: 409/));
test("订单 DELETE 保持普通产品部件清理事务与成功响应", () => {
  assert.match(orderDelete, /prisma\.\$transaction\(\[/);
  assert.match(orderDelete, /prisma\.productPart\.deleteMany\(\{ where: \{ orderId: id \} \}\)/);
  assert.match(orderDelete, /prisma\.product\.deleteMany\(\{ where: \{ orderId: id \} \}\)/);
  assert.match(orderDelete, /prisma\.order\.delete\(\{ where: \{ id \} \}\)/);
  assert.match(orderDelete, /NextResponse\.json\(\{ ok: true \}\)/);
});
test("订单接口未提前实现编号重试或状态转换矩阵", () => {
  assert.doesNotMatch(source.orders, /P2002|retry|重试/i);
  assert.doesNotMatch(source.orderById, /transition|状态转换|allowedTransitions/i);
});
