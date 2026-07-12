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

function sourceSlice(content, start, end) {
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `未找到 ${start}`);
  assert.notEqual(endIndex, -1, `未找到 ${end}`);
  return content.slice(startIndex, endIndex);
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
test("首页导入 hasPermission", () => assert.match(source.dashboard, /import \{ hasPermission \} from "@\/lib\/permissions"/));
test("首页订单查看变量使用 order.view", () => assert.match(source.dashboard, /const canViewOrders = hasPermission\(user\.role, "order\.view", \[\]\)/));
test("首页生产查看变量使用 production.view", () => assert.match(source.dashboard, /const canViewProduction = hasPermission\(user\.role, "production\.view", \[\]\)/));
test("首页齐套查看变量使用 kitting.view", () => assert.match(source.dashboard, /const canViewKitting = hasPermission\(user\.role, "kitting\.view", \[\]\)/));
test("订单条件模块严格包含六项 Prisma 查询", () => {
  const orderData = sourceSlice(source.dashboard, "const orderDataPromise", "const productionDataPromise");
  assert.equal((orderData.match(/prisma\./g) ?? []).length, 6);
});
test("生产条件模块严格包含一项 Prisma 查询", () => {
  const productionData = sourceSlice(source.dashboard, "const productionDataPromise", "const kittingDataPromise");
  assert.equal((productionData.match(/prisma\./g) ?? []).length, 1);
});
test("齐套条件模块严格包含一项 Prisma 查询", () => {
  const kittingData = sourceSlice(source.dashboard, "const kittingDataPromise", "const outsourceDataPromise");
  assert.equal((kittingData.match(/prisma\./g) ?? []).length, 1);
});
test("剩余看板模块严格包含七项 Prisma 查询", () => {
  const remainingData = sourceSlice(source.dashboard, "const remainingDashboardDataPromise", "const [\n    orderData,");
  assert.equal((remainingData.match(/prisma\./g) ?? []).length, 7);
});
test("三个条件模块无权限时都返回 null", () => {
  for (const [start, end] of [
    ["const orderDataPromise", "const productionDataPromise"],
    ["const productionDataPromise", "const kittingDataPromise"],
    ["const kittingDataPromise", "const outsourceDataPromise"]
  ]) {
    assert.match(sourceSlice(source.dashboard, start, end), /Promise\.resolve\(null\)/);
  }
});
test("剩余模块不重复订单、生产或齐套查询", () => {
  const remainingData = sourceSlice(source.dashboard, "const remainingDashboardDataPromise", "const [\n    orderData,");
  for (const query of ["prisma.order.groupBy", "prisma.order.findMany", "productionProductStatuses", "totalQuantity", "returnedQuantity"]) {
    assert.doesNotMatch(remainingData, new RegExp(query.replaceAll(".", "\\.")));
  }
});
test("剩余七项解构顺序与批准映射一致", () => {
  assert.match(source.dashboard, /const \[\s+deliverableProducts,\s+partsWithoutDrawings,\s+thumbnailFailedDrawings,\s+deliveryTodoProductCount,\s+deliveryTodoProducts,\s+missingDrawingPartCount,\s+missingDrawingParts\s+\] = remainingDashboardData/);
});
test("订单三张统计卡读取 orderData 字段", () => {
  for (const field of ["todayNewOrders", "activeOrders", "completedOrders"]) assert.match(source.dashboard, new RegExp(`value: orderData\\.${field}`));
});
test("待处理订单待办受 orderData null 边界控制", () => {
  assert.match(source.dashboard, /\{orderData !== null \? \(\s+<TodoCard title="待处理订单" count=\{orderData\.pendingOrderCount\}/);
});
test("订单状态统计受 orderData 和状态映射 null 边界控制", () => {
  assert.match(source.dashboard, /\{orderData !== null && orderStatusCountMap !== null \? \(/);
});
test("生产统计卡受 productionData null 边界控制", () => {
  assert.match(source.dashboard, /\.\.\.\(productionData !== null\s+\? \[\{\s+title: "生产中产品",\s+value: productionData\.productionProducts/);
});
test("齐套派生计算受 kittingData null 边界控制", () => {
  assert.match(source.dashboard, /const kittingSummary = kittingData === null\s+\? null/);
  assert.match(source.dashboard, /kittingData\.kittingProducts\.filter/);
});
test("统计分组过滤没有卡片的权限分组", () => assert.match(source.dashboard, /\]\.filter\(\(group\) => group\.cards\.length > 0\)/));
test("订单无权限不使用可选链伪装零数据", () => assert.doesNotMatch(source.dashboard, /orderData\?\./));
test("齐套无权限不使用可选链伪装空数组", () => assert.doesNotMatch(source.dashboard, /kittingData\?\.kittingProducts \?\? \[\]/));
test("首页外发查看变量使用 outsource.view", () => assert.match(source.dashboard, /const canViewOutsource = hasPermission\(user\.role, "outsource\.view", \[\]\)/));
test("首页回厂查看变量使用 return.view", () => assert.match(source.dashboard, /const canViewReturns = hasPermission\(user\.role, "return\.view", \[\]\)/));
test("首页生产异常查看变量使用 production.abnormal.view", () => assert.match(source.dashboard, /const canViewProductionAbnormal = hasPermission\(user\.role, "production\.abnormal\.view", \[\]\)/));
test("部分回厂查看变量同时依赖外发和回厂权限", () => assert.match(source.dashboard, /const canViewPartialReturns = canViewOutsource && canViewReturns/));
test("普通外发条件模块严格包含五项 Prisma 查询", () => {
  const outsourceData = sourceSlice(source.dashboard, "const outsourceDataPromise", "const partialReturnDataPromise");
  assert.equal((outsourceData.match(/prisma\./g) ?? []).length, 5);
});
test("部分回厂条件模块严格包含两项 Prisma 查询", () => {
  const partialReturnData = sourceSlice(source.dashboard, "const partialReturnDataPromise", "const returnDataPromise");
  assert.equal((partialReturnData.match(/prisma\./g) ?? []).length, 2);
});
test("异常回厂条件模块严格包含两项 Prisma 查询", () => {
  const returnData = sourceSlice(source.dashboard, "const returnDataPromise", "const productionAbnormalDataPromise");
  assert.equal((returnData.match(/prisma\./g) ?? []).length, 2);
});
test("生产异常条件模块严格包含两项 Prisma 查询", () => {
  const productionAbnormalData = sourceSlice(source.dashboard, "const productionAbnormalDataPromise", "const remainingDashboardDataPromise");
  assert.equal((productionAbnormalData.match(/prisma\./g) ?? []).length, 2);
});
test("四个新条件模块无权限时都返回 null", () => {
  for (const [start, end] of [
    ["const outsourceDataPromise", "const partialReturnDataPromise"],
    ["const partialReturnDataPromise", "const returnDataPromise"],
    ["const returnDataPromise", "const productionAbnormalDataPromise"],
    ["const productionAbnormalDataPromise", "const remainingDashboardDataPromise"]
  ]) {
    assert.match(sourceSlice(source.dashboard, start, end), /Promise\.resolve\(null\)/);
  }
});
test("剩余模块没有保留本阶段拆出的十一项数据", () => {
  const remainingData = sourceSlice(source.dashboard, "const remainingDashboardDataPromise", "const [\n    orderData,");
  for (const name of ["outsourceOrder", "outsourceReturnItem", "productPartAbnormal"]) assert.doesNotMatch(remainingData, new RegExp(name));
});
test("顶层等待包含全部八个模块 Promise", () => {
  assert.match(source.dashboard, /orderDataPromise,\s+productionDataPromise,\s+kittingDataPromise,\s+outsourceDataPromise,\s+partialReturnDataPromise,\s+returnDataPromise,\s+productionAbnormalDataPromise,\s+remainingDashboardDataPromise/);
});
test("外发派生数量受 outsourceData null 边界控制", () => {
  assert.match(source.dashboard, /const outsourceSummary = outsourceData === null\s+\? null/);
  assert.match(source.dashboard, /outsourceData\.unreturnedOutsourceItems\.length/);
});
test("三张普通外发统计卡受 outsourceData null 边界控制", () => {
  assert.match(source.dashboard, /\.\.\.\(outsourceData !== null && outsourceSummary !== null/);
  for (const title of ["外发未回", "外发超期未回", "今日应回外发"]) assert.match(source.dashboard, new RegExp(`title: "${title}"`));
});
test("部分回厂统计卡受 partialReturnData null 边界控制", () => assert.match(source.dashboard, /\.\.\.\(partialReturnData !== null\s+\? \[\{\s+title: "部分回厂"/));
test("超期未回外发待办受 outsourceData null 边界控制", () => assert.match(source.dashboard, /\{outsourceData !== null \? \(\s+<TodoCard title="超期未回外发" count=\{outsourceData\.overdueOutsourceOrders\}/));
test("今日应回外发待办受 outsourceData null 边界控制", () => assert.match(source.dashboard, /\{outsourceData !== null \? \(\s+<TodoCard\s+title="今日应回外发"\s+count=\{outsourceData\.todayDueOutsourceOrders\}/));
test("部分回厂待办受 partialReturnData null 边界控制", () => assert.match(source.dashboard, /\{partialReturnData !== null \? \(\s+<TodoCard title="部分回厂未完成" count=\{partialReturnData\.partialReturnOutsourceOrders\}/));
test("异常回厂待办受 returnData null 边界控制", () => assert.match(source.dashboard, /\{returnData !== null \? \(\s+<TodoCard title="异常回厂" count=\{returnData\.abnormalReturnItemCount\}/));
test("生产异常待办受 productionAbnormalData null 边界控制", () => assert.match(source.dashboard, /\{productionAbnormalData !== null \? \(\s+<TodoCard title="未处理生产异常" count=\{productionAbnormalData\.openProductionAbnormalCount\}/));
test("外发无权限不使用可选链伪装零数据", () => assert.doesNotMatch(source.dashboard, /outsourceData\?\./));
test("部分回厂无权限不使用可选链伪装空数组", () => assert.doesNotMatch(source.dashboard, /partialReturnData\?\./));
test("异常回厂无权限不使用可选链伪装零数据", () => assert.doesNotMatch(source.dashboard, /returnData\?\./));
test("生产异常无权限不使用可选链伪装空数组", () => assert.doesNotMatch(source.dashboard, /productionAbnormalData\?\./));
test("本阶段没有提前增加送货或图纸权限变量", () => assert.doesNotMatch(source.dashboard, /canView(?:Delivery|Drawings)/));
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
