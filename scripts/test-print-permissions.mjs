import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readSource(...segments) {
  return readFile(path.join(root, ...segments), "utf8");
}

function functionBody(source, name) {
  const marker = `export default async function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `缺少 ${name} 页面函数`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} 页面函数缺少函数体`);
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
  assert.fail(`${name} 页面函数体未闭合`);
}

function assertBefore(body, first, second) {
  const firstIndex = body.indexOf(first);
  const secondIndex = body.indexOf(second);
  assert.notEqual(firstIndex, -1, `找不到 ${first}`);
  assert.notEqual(secondIndex, -1, `找不到 ${second}`);
  assert.ok(firstIndex < secondIndex, `${first} 必须早于 ${second}`);
}

function occurrenceCount(value, target) {
  return value.split(target).length - 1;
}

const source = {
  orderPrint: await readSource("src", "app", "(protected)", "orders", "[id]", "print", "page.tsx"),
  outsourcePrint: await readSource("src", "app", "(protected)", "outsourcing", "[id]", "print", "page.tsx"),
  returnPrint: await readSource("src", "app", "(protected)", "returns", "[id]", "print", "page.tsx"),
  deliveryPrint: await readSource("src", "app", "(protected)", "delivery", "[id]", "print", "page.tsx"),
  self: await readSource("scripts", "test-print-permissions.mjs")
};

const orderPrintPage = functionBody(source.orderPrint, "OrderPrintPage");
const outsourcePrintPage = functionBody(source.outsourcePrint, "OutsourcePrintPage");
const returnPrintPage = functionBody(source.returnPrint, "ReturnPrintPage");
const deliveryPrintPage = functionBody(source.deliveryPrint, "DeliveryPrintPage");

test("订单打印页导入页面权限助手", () => {
  assert.match(source.orderPrint, /import \{ requirePageAllPermissions, requirePagePermission \} from "@\/lib\/auth\/authorization"/);
});

test("订单打印页首项权限为 order.view", () => {
  assert.match(orderPrintPage, /^\{\s*await requirePagePermission\("order\.view"\)/);
});

test("订单打印页只调用一次 order.view 页面权限助手", () => {
  assert.equal(occurrenceCount(orderPrintPage, 'requirePagePermission("order.view")'), 1);
});

test("订单打印页检查 order.print", () => {
  assert.match(orderPrintPage, /requirePageAllPermissions\(\["order\.print", "drawing\.view"\]\)/);
});

test("订单打印页检查 drawing.view", () => {
  assert.match(orderPrintPage, /requirePageAllPermissions\(\["order\.print", "drawing\.view"\]\)/);
});

test("订单打印页不检查 drawing.viewOriginal", () => {
  assert.doesNotMatch(orderPrintPage, /drawing\.viewOriginal/);
});

test("订单打印页没有角色硬编码", () => {
  assert.doesNotMatch(source.orderPrint, /role\s*===|ADMIN|OWNER|SALES|PRODUCTION|OUTSOURCE|DELIVERY/);
});

test("订单打印页不直接读取 Cookie 或 Session", () => {
  assert.doesNotMatch(source.orderPrint, /cookies\(|session/i);
});

test("order.view 鉴权早于 params", () => {
  assertBefore(orderPrintPage, 'requirePagePermission("order.view")', "await params");
});

test("order.print 鉴权早于 params", () => {
  assertBefore(orderPrintPage, "requirePageAllPermissions", "await params");
});

test("drawing.view 鉴权早于 params", () => {
  assertBefore(orderPrintPage, '"drawing.view"', "await params");
});

test("order.view 鉴权早于 Prisma", () => {
  assertBefore(orderPrintPage, 'requirePagePermission("order.view")', "prisma.order.findFirst");
});

test("order.print 鉴权早于 Prisma", () => {
  assertBefore(orderPrintPage, "requirePageAllPermissions", "prisma.order.findFirst");
});

test("drawing.view 鉴权早于 Prisma", () => {
  assertBefore(orderPrintPage, '"drawing.view"', "prisma.order.findFirst");
});

test("三项权限都早于 notFound", () => {
  assertBefore(orderPrintPage, 'requirePagePermission("order.view")', "notFound()");
  assertBefore(orderPrintPage, "requirePageAllPermissions", "notFound()");
  assertBefore(orderPrintPage, '"drawing.view"', "notFound()");
});

test("订单打印页保留 Prisma 查询结构", () => {
  assert.match(orderPrintPage, /prisma\.order\.findFirst/);
  assert.match(orderPrintPage, /orderBy: \{ createdAt: "asc" \}/);
  assert.match(orderPrintPage, /drawings: \{/);
});

test("订单打印页保留打印缩略图 URL", () => {
  assert.match(source.orderPrint, /protectedDrawing\?\.printThumbnailUrl \?\? protectedDrawing\?\.thumbnailUrl/);
});

test("订单打印页保留 PrintActions", () => {
  assert.match(source.orderPrint, /import \{ PrintActions \} from "\.\/print-actions"/);
  assert.match(orderPrintPage, /<PrintActions orderId=\{order\.id\} \/>/);
});

test("订单打印页保留原打印文案", () => {
  assert.match(source.orderPrint, /金鸿ERP 生产任务单/);
});

test("订单打印页使用统一 forbidden 权限助手而非直接 redirect", () => {
  assert.match(source.orderPrint, /requirePagePermission/);
  assert.match(source.orderPrint, /requirePageAllPermissions/);
  assert.doesNotMatch(source.orderPrint, /redirect\("\/forbidden"\)/);
});

test("订单打印页不直接调用图纸原件 file 接口", () => {
  assert.doesNotMatch(source.orderPrint, /\/api\/drawings\/.*\/file/);
});

test("订单打印页没有新增写操作", () => {
  assert.doesNotMatch(source.orderPrint, /fetch\(|method:\s*"(?:POST|PATCH|PUT|DELETE)"|prisma\.[\w$]+\.(?:create|update|delete)/);
});

test("外发打印页导入页面权限助手", () => {
  assert.match(source.outsourcePrint, /import \{ requirePageAllPermissions, requirePagePermission \} from "@\/lib\/auth\/authorization"/);
});

test("外发打印页首项权限为 outsource.view", () => {
  assert.match(outsourcePrintPage, /^\{\s*await requirePagePermission\("outsource\.view"\)/);
});

test("外发打印页检查 outsource.print 与 drawing.view", () => {
  assert.match(outsourcePrintPage, /requirePageAllPermissions\(\["outsource\.print", "drawing\.view"\]\)/);
});

test("外发打印页不检查图纸原件或图纸打印权限", () => {
  assert.doesNotMatch(outsourcePrintPage, /drawing\.viewOriginal|drawing\.print/);
});

test("外发打印三项权限早于 params", () => {
  assertBefore(outsourcePrintPage, 'requirePagePermission("outsource.view")', "await params");
  assertBefore(outsourcePrintPage, "requirePageAllPermissions", "await params");
  assertBefore(outsourcePrintPage, '"drawing.view"', "await params");
});

test("外发打印三项权限早于 Prisma", () => {
  assertBefore(outsourcePrintPage, 'requirePagePermission("outsource.view")', "prisma.outsourceOrder.findFirst");
  assertBefore(outsourcePrintPage, "requirePageAllPermissions", "prisma.outsourceOrder.findFirst");
  assertBefore(outsourcePrintPage, '"drawing.view"', "prisma.outsourceOrder.findFirst");
});

test("外发打印三项权限早于 notFound", () => {
  assertBefore(outsourcePrintPage, 'requirePagePermission("outsource.view")', "notFound()");
  assertBefore(outsourcePrintPage, "requirePageAllPermissions", "notFound()");
  assertBefore(outsourcePrintPage, '"drawing.view"', "notFound()");
});

test("外发打印页没有角色、Cookie 或 Session 直读", () => {
  assert.doesNotMatch(outsourcePrintPage, /role\s*===|cookies\(|session/i);
});

test("外发打印页保留查询、PrintActions 和受保护图纸 URL", () => {
  assert.match(outsourcePrintPage, /prisma\.outsourceOrder\.findFirst/);
  assert.match(outsourcePrintPage, /<PrintActions id=\{outsourceOrder\.id\} \/>/);
  assert.match(source.outsourcePrint, /withProtectedOutsourceDrawingUrls\(item\)\.thumbnailUrl/);
});

test("回厂打印页导入页面权限助手", () => {
  assert.match(source.returnPrint, /import \{ requirePageAllPermissions, requirePagePermission \} from "@\/lib\/auth\/authorization"/);
});

test("回厂打印页首项权限为 return.view", () => {
  assert.match(returnPrintPage, /^\{\s*await requirePagePermission\("return\.view"\)/);
});

test("回厂打印页检查 return.print 与 drawing.view", () => {
  assert.match(returnPrintPage, /requirePageAllPermissions\(\["return\.print", "drawing\.view"\]\)/);
});

test("回厂打印页不检查图纸原件或图纸打印权限", () => {
  assert.doesNotMatch(returnPrintPage, /drawing\.viewOriginal|drawing\.print/);
});

test("回厂打印三项权限早于 params", () => {
  assertBefore(returnPrintPage, 'requirePagePermission("return.view")', "await params");
  assertBefore(returnPrintPage, "requirePageAllPermissions", "await params");
  assertBefore(returnPrintPage, '"drawing.view"', "await params");
});

test("回厂打印三项权限早于 Prisma", () => {
  assertBefore(returnPrintPage, 'requirePagePermission("return.view")', "prisma.outsourceReturn.findUnique");
  assertBefore(returnPrintPage, "requirePageAllPermissions", "prisma.outsourceReturn.findUnique");
  assertBefore(returnPrintPage, '"drawing.view"', "prisma.outsourceReturn.findUnique");
});

test("回厂打印三项权限早于 notFound", () => {
  assertBefore(returnPrintPage, 'requirePagePermission("return.view")', "notFound()");
  assertBefore(returnPrintPage, "requirePageAllPermissions", "notFound()");
  assertBefore(returnPrintPage, '"drawing.view"', "notFound()");
});

test("回厂打印页没有角色、Cookie 或 Session 直读", () => {
  assert.doesNotMatch(returnPrintPage, /role\s*===|cookies\(|session/i);
});

test("回厂打印页保留查询、PrintActions 和受保护图纸 URL", () => {
  assert.match(returnPrintPage, /prisma\.outsourceReturn\.findUnique/);
  assert.match(returnPrintPage, /<PrintActions id=\{returnOrder\.id\} \/>/);
  assert.match(source.returnPrint, /withProtectedOutsourceDrawingUrls\(outsourceItem\)\.thumbnailUrl/);
});

test("送货打印页导入页面权限助手", () => {
  assert.match(source.deliveryPrint, /import \{ requirePageAllPermissions, requirePagePermission \} from "@\/lib\/auth\/authorization"/);
});

test("送货打印页首项权限为 delivery.view", () => {
  assert.match(deliveryPrintPage, /^\{\s*await requirePagePermission\("delivery\.view"\)/);
});

test("送货打印页检查 delivery.print", () => {
  assert.match(deliveryPrintPage, /requirePageAllPermissions\(\["delivery\.print"\]\)/);
});

test("送货打印页不要求图纸权限", () => {
  assert.doesNotMatch(deliveryPrintPage, /drawing\.view(?:Original)?|drawing\.print/);
});

test("送货打印两项权限早于 params", () => {
  assertBefore(deliveryPrintPage, 'requirePagePermission("delivery.view")', "await params");
  assertBefore(deliveryPrintPage, "requirePageAllPermissions", "await params");
});

test("送货打印两项权限早于 Prisma", () => {
  assertBefore(deliveryPrintPage, 'requirePagePermission("delivery.view")', "prisma.deliveryOrder.findFirst");
  assertBefore(deliveryPrintPage, "requirePageAllPermissions", "prisma.deliveryOrder.findFirst");
});

test("送货打印两项权限早于 notFound", () => {
  assertBefore(deliveryPrintPage, 'requirePagePermission("delivery.view")', "notFound()");
  assertBefore(deliveryPrintPage, "requirePageAllPermissions", "notFound()");
});

test("送货打印页没有角色、Cookie 或 Session 直读", () => {
  assert.doesNotMatch(deliveryPrintPage, /role\s*===|cookies\(|session/i);
});

test("送货打印页保留 Prisma 查询和 PrintActions", () => {
  assert.match(deliveryPrintPage, /prisma\.deliveryOrder\.findFirst/);
  assert.match(deliveryPrintPage, /<PrintActions deliveryOrderId=\{deliveryOrder\.id\} \/>/);
});

test("外发打印页只调用一次 outsource.view", () => {
  assert.equal(occurrenceCount(outsourcePrintPage, 'requirePagePermission("outsource.view")'), 1);
});

test("回厂打印页只调用一次 return.view", () => {
  assert.equal(occurrenceCount(returnPrintPage, 'requirePagePermission("return.view")'), 1);
});

test("送货打印页只调用一次 delivery.view", () => {
  assert.equal(occurrenceCount(deliveryPrintPage, 'requirePagePermission("delivery.view")'), 1);
});

test("三个新增打印页不重复调用 requirePageUser", () => {
  for (const page of [outsourcePrintPage, returnPrintPage, deliveryPrintPage]) {
    assert.doesNotMatch(page, /requirePageUser/);
  }
});

test("三个新增打印页不直接跳转 forbidden", () => {
  for (const page of [outsourcePrintPage, returnPrintPage, deliveryPrintPage]) {
    assert.doesNotMatch(page, /redirect\("\/forbidden"\)/);
  }
});

test("三个新增打印页保持 force-dynamic", () => {
  for (const page of [source.outsourcePrint, source.returnPrint, source.deliveryPrint]) {
    assert.match(page, /export const dynamic = "force-dynamic"/);
  }
});

test("三个新增打印页不额外跨模块要求权限", () => {
  assert.doesNotMatch(outsourcePrintPage, /order\.view|return\.view|delivery\.view/);
  assert.doesNotMatch(returnPrintPage, /order\.view|outsource\.view|delivery\.view/);
  assert.doesNotMatch(deliveryPrintPage, /order\.view|outsource\.view|return\.view/);
});

test("四个独立打印页均保持统一页面权限体系", () => {
  for (const page of [orderPrintPage, outsourcePrintPage, returnPrintPage, deliveryPrintPage]) {
    assert.match(page, /requirePagePermission/);
    assert.match(page, /requirePageAllPermissions/);
  }
});

test("外发和回厂打印图纸仍经受保护 URL 工具生成", () => {
  assert.match(source.outsourcePrint, /withProtectedOutsourceDrawingUrls/);
  assert.match(source.returnPrint, /withProtectedOutsourceDrawingUrls/);
});

test("生产打印页未在本阶段修改", async () => {
  const productionPrint = await readSource("src", "app", "(protected)", "production", "daily", "page.tsx");
  assert.doesNotMatch(productionPrint, /requirePageAllPermissions/);
});

test("打印权限静态测试自身不连接数据库或写文件", () => {
  const blocked = ["@prisma" + "/client", "write" + "File", "append" + "File", "fetch" + "(", "spawn" + "("];
  for (const marker of blocked) assert.equal(source.self.includes(marker), false, `测试脚本不得包含 ${marker}`);
});
