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

test("外发打印页未接入本阶段页面权限", () => {
  assert.doesNotMatch(source.outsourcePrint, /requirePage(?:All)?Permissions?/);
});

test("回厂打印页未接入本阶段页面权限", () => {
  assert.doesNotMatch(source.returnPrint, /requirePage(?:All)?Permissions?/);
});

test("送货打印页未接入本阶段页面权限", () => {
  assert.doesNotMatch(source.deliveryPrint, /requirePage(?:All)?Permissions?/);
});

test("打印权限静态测试自身不连接数据库或写文件", () => {
  const blocked = ["@prisma" + "/client", "write" + "File", "append" + "File", "fetch" + "(", "spawn" + "("];
  for (const marker of blocked) assert.equal(source.self.includes(marker), false, `测试脚本不得包含 ${marker}`);
});
