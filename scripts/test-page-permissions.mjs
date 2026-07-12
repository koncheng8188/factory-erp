import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasPermission, isPermission } from "../src/lib/permissions.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  dashboard: "src/app/(protected)/page.tsx",
  products: "src/app/(protected)/products/page.tsx",
  parts: "src/app/(protected)/parts/page.tsx",
  data: "src/app/(protected)/settings/data/page.tsx",
  returns: "src/app/(protected)/returns/page.tsx",
  returnDetail: "src/app/(protected)/returns/[id]/page.tsx",
  deliveryDetail: "src/app/(protected)/delivery/[id]/page.tsx",
  layout: "src/app/(protected)/layout.tsx",
  forbidden: "src/app/(protected)/forbidden/page.tsx"
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, relativePath]) => [key, await readFile(path.join(root, relativePath), "utf8")]))
);

function assertBefore(content, first, later) {
  const firstIndex = content.indexOf(first);
  const laterIndex = content.indexOf(later);
  assert.notEqual(firstIndex, -1, `未找到 ${first}`);
  assert.notEqual(laterIndex, -1, `未找到 ${later}`);
  assert.ok(firstIndex < laterIndex, `${first} 必须出现在 ${later} 之前`);
}

function occurrenceCount(content, value) {
  return content.split(value).length - 1;
}

function menuEntry(label) {
  const match = new RegExp(`\\{ href: "[^"]+", label: "${label}"(?:, permission: "([^"]+)")? \\}`).exec(source.layout);
  assert.ok(match, `未找到菜单：${label}`);
  return match[1];
}

test("产品页引用页面权限助手", () => assert.match(source.products, /import \{ requirePagePermission \}/));
test("产品页使用 product.view", () => assert.match(source.products, /requirePagePermission\("product\.view"\)/));
test("产品页先鉴权再查询 Prisma", () => assertBefore(source.products, 'requirePagePermission("product.view")', "prisma.product.findMany"));
test("部件页引用页面权限助手", () => assert.match(source.parts, /import \{ requirePagePermission \}/));
test("部件页使用 part.view", () => assert.match(source.parts, /requirePagePermission\("part\.view"\)/));
test("部件页先鉴权再解析筛选参数", () => assertBefore(source.parts, 'requirePagePermission("part.view")', "await searchParams"));
test("部件页先鉴权再查询 Prisma", () => assertBefore(source.parts, 'requirePagePermission("part.view")', "prisma.productPart.findMany"));
test("数据管理页引用页面权限助手", () => assert.match(source.data, /import \{ requirePagePermission \}/));
test("数据管理页使用 dataManagement.view", () => assert.match(source.data, /requirePagePermission\("dataManagement\.view"\)/));
test("数据管理页先鉴权再查询 Prisma", () => assertBefore(source.data, 'requirePagePermission("dataManagement.view")', "prisma.customer.count"));
test("数据管理页先鉴权再读取文件系统", () => assertBefore(source.data, 'requirePagePermission("dataManagement.view")', "fs.stat"));
test("已接入页面均不读取 Cookie", () => {
  for (const key of ["products", "parts", "data", "returns", "returnDetail", "deliveryDetail"]) assert.doesNotMatch(source[key], /cookies\(|document\.cookie/);
});
test("已接入页面均无角色硬编码", () => {
  for (const key of ["products", "parts", "data", "returns", "returnDetail", "deliveryDetail"]) assert.doesNotMatch(source[key], /role\s*(?:===|!==)/);
});
test("已接入页面均不重复调用 requirePageUser", () => {
  for (const key of ["products", "parts", "data", "returns", "returnDetail", "deliveryDetail"]) assert.doesNotMatch(source[key], /requirePageUser/);
});
test("布局仍调用 requirePageUser", () => assert.match(source.layout, /const user = await requirePageUser\(\)/));
test("产品菜单绑定 product.view", () => assert.equal(menuEntry("产品管理"), "product.view"));
test("部件菜单绑定 part.view", () => assert.equal(menuEntry("部件管理"), "part.view"));
test("数据管理菜单绑定 dataManagement.view", () => assert.equal(menuEntry("数据管理"), "dataManagement.view"));
test("回厂登记菜单绑定 return.view", () => assert.equal(menuEntry("回厂登记"), "return.view"));
test("送货管理菜单继续不绑定权限", () => assert.equal(menuEntry("送货管理"), undefined));
test("布局使用 hasPermission 和空覆盖", () => assert.match(source.layout, /hasPermission\(role, item\.permission, \[\]\)/));
test("布局没有角色硬编码", () => assert.doesNotMatch(source.layout, /role\s*(?:===|!==)/));
test("未接入菜单没有提前绑定权限", () => {
  for (const label of ["客户管理", "图纸管理", "订单管理", "生产进度", "齐套检查", "外发电镀", "送货管理", "生产日报", "生产异常", "Excel 导入", "系统备份"]) {
    assert.equal(menuEntry(label), undefined, `${label} 不应提前绑定权限`);
  }
});
test("forbidden 页面不调用业务权限助手", () => assert.doesNotMatch(source.forbidden, /requirePage(?:Any|All)?Permission/));
test("导航绑定的权限键全部合法", () => {
  const bound = [...source.layout.matchAll(/permission: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(bound, ["dashboard.view", "product.view", "part.view", "return.view", "dataManagement.view"]);
  for (const permission of bound) assert.equal(isPermission(permission), true);
});
test("SALES 默认具有产品和部件查看权限", () => {
  assert.equal(hasPermission("SALES", "product.view"), true);
  assert.equal(hasPermission("SALES", "part.view"), true);
});
test("SALES 默认没有数据管理权限", () => assert.equal(hasPermission("SALES", "dataManagement.view"), false));
test("OWNER 默认具有数据管理权限", () => assert.equal(hasPermission("OWNER", "dataManagement.view"), true));
test("ADMIN 默认具有数据管理权限", () => assert.equal(hasPermission("ADMIN", "dataManagement.view"), true));
test("DELIVERY 默认具有产品和部件查看权限", () => {
  assert.equal(hasPermission("DELIVERY", "product.view"), true);
  assert.equal(hasPermission("DELIVERY", "part.view"), true);
});
test("回厂列表先鉴权再解析筛选参数和查询 Prisma", () => {
  assert.match(source.returns, /requirePagePermission\("return\.view"\)/);
  assertBefore(source.returns, 'requirePagePermission("return.view")', "await searchParams");
  assertBefore(source.returns, 'requirePagePermission("return.view")', "prisma.outsourceReturn.findMany");
});
test("回厂详情严格按鉴权、params、Prisma、notFound 顺序", () => {
  assert.match(source.returnDetail, /requirePagePermission\("return\.view"\)/);
  assertBefore(source.returnDetail, 'requirePagePermission("return.view")', "await params");
  assertBefore(source.returnDetail, "await params", "prisma.outsourceReturn.findUnique");
  assertBefore(source.returnDetail, "prisma.outsourceReturn.findUnique", "notFound()");
});
test("送货详情严格按鉴权、params、Prisma、notFound 顺序", () => {
  assert.match(source.deliveryDetail, /requirePagePermission\("delivery\.view"\)/);
  assertBefore(source.deliveryDetail, 'requirePagePermission("delivery.view")', "await params");
  assertBefore(source.deliveryDetail, "await params", "prisma.deliveryOrder.findFirst");
  assertBefore(source.deliveryDetail, "prisma.deliveryOrder.findFirst", "notFound()");
});
test("回厂和送货详情未提前接入创建或打印权限", () => {
  for (const key of ["returns", "returnDetail"]) assert.doesNotMatch(source[key], /return\.(?:create|print)/);
  assert.doesNotMatch(source.deliveryDetail, /delivery\.(?:create|print)/);
});
test("六个角色默认都具有回厂和送货查看权限", () => {
  for (const role of ["ADMIN", "OWNER", "SALES", "PRODUCTION", "OUTSOURCE", "DELIVERY"]) {
    assert.equal(hasPermission(role, "return.view"), true);
    assert.equal(hasPermission(role, "delivery.view"), true);
  }
});
test("回厂列表只调用一次页面权限助手", () => {
  assert.equal(occurrenceCount(source.returns, 'requirePagePermission("return.view")'), 1);
});
test("回厂列表不调用 requirePageUser", () => assert.doesNotMatch(source.returns, /requirePageUser/));
test("回厂列表不直接导入或读取 Cookie", () => assert.doesNotMatch(source.returns, /next\/headers|cookies\(|document\.cookie/));
test("回厂列表不包含角色名称硬编码", () => assert.doesNotMatch(source.returns, /\b(?:ADMIN|OWNER|SALES|PRODUCTION|OUTSOURCE|DELIVERY)\b/));
test("回厂列表权限检查早于首个 Prisma 调用", () => assertBefore(source.returns, 'requirePagePermission("return.view")', "prisma."));
test("回厂详情只调用一次页面权限助手", () => {
  assert.equal(occurrenceCount(source.returnDetail, 'requirePagePermission("return.view")'), 1);
});
test("回厂详情不调用 requirePageUser", () => assert.doesNotMatch(source.returnDetail, /requirePageUser/));
test("回厂详情不直接导入或读取 Cookie", () => assert.doesNotMatch(source.returnDetail, /next\/headers|cookies\(|document\.cookie/));
test("回厂详情 notFound 位于权限检查之后", () => assertBefore(source.returnDetail, 'requirePagePermission("return.view")', "notFound()"));
test("回厂详情未接入 return.print", () => assert.doesNotMatch(source.returnDetail, /return\.print/));
test("送货详情只调用一次页面权限助手", () => {
  assert.equal(occurrenceCount(source.deliveryDetail, 'requirePagePermission("delivery.view")'), 1);
});
test("送货详情不调用 requirePageUser", () => assert.doesNotMatch(source.deliveryDetail, /requirePageUser/));
test("送货详情不直接导入或读取 Cookie", () => assert.doesNotMatch(source.deliveryDetail, /next\/headers|cookies\(|document\.cookie/));
test("送货详情 notFound 位于权限检查之后", () => assertBefore(source.deliveryDetail, 'requirePagePermission("delivery.view")', "notFound()"));
test("送货详情未接入 delivery.print", () => assert.doesNotMatch(source.deliveryDetail, /delivery\.print/));
test("首页引用页面权限助手", () => assert.match(source.dashboard, /import \{ requirePagePermission \}/));
test("首页使用 dashboard.view", () => assert.match(source.dashboard, /requirePagePermission\("dashboard\.view"\)/));
test("首页只调用一次页面权限助手", () => assert.equal(occurrenceCount(source.dashboard, 'requirePagePermission("dashboard.view")'), 1));
test("首页鉴权早于首个 Prisma 查询", () => assertBefore(source.dashboard, 'requirePagePermission("dashboard.view")', "prisma."));
test("首页不调用 requirePageUser", () => assert.doesNotMatch(source.dashboard, /requirePageUser/));
test("首页不直接读取 Cookie", () => assert.doesNotMatch(source.dashboard, /next\/headers|cookies\(|document\.cookie/));
test("首页不直接读取 Session", () => assert.doesNotMatch(source.dashboard, /getCurrentSession|session\./));
test("首页没有角色硬编码", () => assert.doesNotMatch(source.dashboard, /role\s*(?:===|!==)|\b(?:ADMIN|OWNER|SALES|PRODUCTION|OUTSOURCE|DELIVERY)\b/));
test("首页保持动态渲染", () => assert.match(source.dashboard, /export const dynamic = "force-dynamic"/));
test("首页菜单绑定 dashboard.view", () => assert.equal(menuEntry("首页看板"), "dashboard.view"));
test("首页菜单不丢失 C1a 和 C1b 权限绑定", () => {
  assert.equal(menuEntry("产品管理"), "product.view");
  assert.equal(menuEntry("部件管理"), "part.view");
  assert.equal(menuEntry("数据管理"), "dataManagement.view");
  assert.equal(menuEntry("回厂登记"), "return.view");
});
test("首页导航绑定的权限键全部合法", () => {
  const bound = [...source.layout.matchAll(/permission: "([^"]+)"/g)].map((match) => match[1]);
  assert.ok(bound.includes("dashboard.view"));
  for (const permission of bound) assert.equal(isPermission(permission), true);
});
test("首页仍保留原 26 项 Prisma 查询", () => assert.equal((source.dashboard.match(/prisma\./g) ?? []).length, 26));
test("业务 API 未引用新权限助手", async () => {
  const apiRoot = path.join(root, "src/app/api");
  const { readdir } = await import("node:fs/promises");
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(target);
      if (entry.isFile() && entry.name === "route.ts") {
        const content = await readFile(target, "utf8");
        assert.doesNotMatch(content, /requireApi(?:Any|All)?Permission/);
      }
    }
  }
  await scan(apiRoot);
});
test("静态测试仅执行只读文件检查", async () => {
  const self = await readFile(fileURLToPath(import.meta.url), "utf8");
  const forbiddenCalls = ["write", "append"].map((prefix) => new RegExp(`${prefix}File\\s*\\(`));
  forbiddenCalls.push(new RegExp(`un${"link"}\\s*\\(`), new RegExp(`m${"kdir"}\\s*\\(`), new RegExp(`r${"m"}\\s*\\(`));
  for (const pattern of forbiddenCalls) assert.doesNotMatch(self, pattern);
  assert.doesNotMatch(self, new RegExp(`Prisma${"Client"}|@/lib/${"prisma"}`));
});
