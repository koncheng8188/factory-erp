import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasPermission, isPermission } from "../src/lib/permissions.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  products: "src/app/(protected)/products/page.tsx",
  parts: "src/app/(protected)/parts/page.tsx",
  data: "src/app/(protected)/settings/data/page.tsx",
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
test("三个页面均不读取 Cookie", () => {
  for (const key of ["products", "parts", "data"]) assert.doesNotMatch(source[key], /cookies\(|document\.cookie/);
});
test("三个页面均无角色硬编码", () => {
  for (const key of ["products", "parts", "data"]) assert.doesNotMatch(source[key], /role\s*(?:===|!==)/);
});
test("三个页面均不重复调用 requirePageUser", () => {
  for (const key of ["products", "parts", "data"]) assert.doesNotMatch(source[key], /requirePageUser/);
});
test("布局仍调用 requirePageUser", () => assert.match(source.layout, /const user = await requirePageUser\(\)/));
test("产品菜单绑定 product.view", () => assert.equal(menuEntry("产品管理"), "product.view"));
test("部件菜单绑定 part.view", () => assert.equal(menuEntry("部件管理"), "part.view"));
test("数据管理菜单绑定 dataManagement.view", () => assert.equal(menuEntry("数据管理"), "dataManagement.view"));
test("布局使用 hasPermission 和空覆盖", () => assert.match(source.layout, /hasPermission\(role, item\.permission, \[\]\)/));
test("布局没有角色硬编码", () => assert.doesNotMatch(source.layout, /role\s*(?:===|!==)/));
test("未接入菜单没有提前绑定权限", () => {
  for (const label of ["首页看板", "客户管理", "图纸管理", "订单管理", "生产进度", "齐套检查", "外发电镀", "回厂登记", "送货管理", "生产日报", "生产异常", "Excel 导入", "系统备份"]) {
    assert.equal(menuEntry(label), undefined, `${label} 不应提前绑定权限`);
  }
});
test("forbidden 页面不调用业务权限助手", () => assert.doesNotMatch(source.forbidden, /requirePage(?:Any|All)?Permission/));
test("导航绑定的权限键全部合法", () => {
  const bound = [...source.layout.matchAll(/permission: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(bound, ["product.view", "part.view", "dataManagement.view"]);
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
