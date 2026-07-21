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
  kitting: "src/app/(protected)/kitting/page.tsx",
  kittingManager: "src/app/(protected)/kitting/kitting-manager.tsx",
  excelImport: "src/app/(protected)/imports/excel/page.tsx",
  excelImportManager: "src/app/(protected)/imports/excel/import-excel-manager.tsx",
  backupPage: "src/app/(protected)/settings/backup/page.tsx",
  backupManager: "src/app/(protected)/settings/backup/backup-manager.tsx",
  backupListApi: "src/app/api/system/backup/list/route.ts",
  backupCreateApi: "src/app/api/system/backup/route.ts",
  customers: "src/app/(protected)/customers/page.tsx",
  customerManager: "src/app/(protected)/customers/customer-manager.tsx",
  orders: "src/app/(protected)/orders/page.tsx",
  orderListManager: "src/app/(protected)/orders/order-manager.tsx",
  outsourcing: "src/app/(protected)/outsourcing/page.tsx",
  outsourcingManager: "src/app/(protected)/outsourcing/outsourcing-manager.tsx",
  outsourceNew: "src/app/(protected)/outsourcing/new/page.tsx",
  outsourceCreateManager: "src/app/(protected)/outsourcing/new/outsource-create-manager.tsx",
  returnNew: "src/app/(protected)/returns/new/page.tsx",
  returnCreateManager: "src/app/(protected)/returns/new/return-create-manager.tsx",
  delivery: "src/app/(protected)/delivery/page.tsx",
  orderDetail: "src/app/(protected)/orders/[id]/page.tsx",
  orderManager: "src/app/(protected)/orders/[id]/order-detail-manager.tsx",
  drawingUploadCenter: "src/app/(protected)/orders/[id]/drawings/upload-center/page.tsx",
  drawingUploadCenterManager: "src/app/(protected)/orders/[id]/drawings/upload-center/upload-center-manager.tsx",
  production: "src/app/(protected)/production/page.tsx",
  productionManager: "src/app/(protected)/production/production-manager.tsx",
  productionDaily: "src/app/(protected)/production/daily/page.tsx",
  dailyPrintButton: "src/app/(protected)/production/daily/daily-print-button.tsx",
  productionAbnormal: "src/app/(protected)/production/abnormal/page.tsx",
  abnormalPrintButton: "src/app/(protected)/production/abnormal/abnormal-print-button.tsx",
  abnormalResolveActions: "src/app/(protected)/production/abnormal/abnormal-resolve-actions.tsx",
  outsourceDetail: "src/app/(protected)/outsourcing/[id]/page.tsx",
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

function functionBody(content, declaration) {
  const declarationIndex = content.indexOf(declaration);
  assert.notEqual(declarationIndex, -1, `未找到函数声明：${declaration}`);

  const parameterStart = content.indexOf("(", declarationIndex);
  assert.notEqual(parameterStart, -1, `未找到函数参数：${declaration}`);

  let parameterDepth = 0;
  let parameterEnd = -1;
  for (let index = parameterStart; index < content.length; index += 1) {
    if (content[index] === "(") parameterDepth += 1;
    if (content[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      parameterEnd = index;
      break;
    }
  }
  assert.notEqual(parameterEnd, -1, `函数参数未闭合：${declaration}`);

  const bodyStart = content.indexOf("{", parameterEnd);
  assert.notEqual(bodyStart, -1, `未找到函数体：${declaration}`);

  let depth = 0;
  for (let index = bodyStart; index < content.length; index += 1) {
    if (content[index] === "{") depth += 1;
    if (content[index] === "}") depth -= 1;
    if (depth === 0) return content.slice(bodyStart, index + 1);
  }

  assert.fail(`函数体未闭合：${declaration}`);
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
  for (const key of ["products", "parts", "data", "returns", "outsourceDetail", "returnDetail", "deliveryDetail"]) assert.doesNotMatch(source[key], /cookies\(|document\.cookie/);
});
test("已接入页面均无角色硬编码", () => {
  for (const key of ["products", "parts", "data", "returns", "outsourceDetail", "returnDetail", "deliveryDetail"]) assert.doesNotMatch(source[key], /role\s*(?:===|!==)/);
});
test("已接入页面均不重复调用 requirePageUser", () => {
  for (const key of ["products", "parts", "data", "returns", "outsourceDetail", "returnDetail", "deliveryDetail"]) assert.doesNotMatch(source[key], /requirePageUser/);
});
test("布局仍调用 requirePageUser", () => assert.match(source.layout, /const user = await requirePageUser\(\)/));
test("产品菜单绑定 product.view", () => assert.equal(menuEntry("产品管理"), "product.view"));
test("部件菜单绑定 part.view", () => assert.equal(menuEntry("部件管理"), "part.view"));
test("图纸管理菜单绑定 drawing.view", () => assert.equal(menuEntry("图纸管理"), "drawing.view"));
test("数据管理菜单绑定 dataManagement.view", () => assert.equal(menuEntry("数据管理"), "dataManagement.view"));
test("回厂登记菜单绑定 return.view", () => assert.equal(menuEntry("回厂登记"), "return.view"));
test("送货管理菜单绑定 delivery.view", () => assert.equal(menuEntry("送货管理"), "delivery.view"));
test("布局使用 hasPermission 和空覆盖", () => assert.match(source.layout, /hasPermission\(role, item\.permission, \[\]\)/));
test("布局没有角色硬编码", () => assert.doesNotMatch(source.layout, /role\s*(?:===|!==)/));
test("系统备份菜单绑定 backup.view", () => assert.equal(menuEntry("系统备份"), "backup.view"));
test("forbidden 页面不调用业务权限助手", () => assert.doesNotMatch(source.forbidden, /requirePage(?:Any|All)?Permission/));
test("导航绑定的权限键全部合法", () => {
  const bound = [...source.layout.matchAll(/permission: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(bound, ["dashboard.view", "customer.view", "product.view", "part.view", "drawing.view", "order.view", "production.view", "kitting.view", "outsource.view", "return.view", "delivery.view", "production.daily.view", "production.abnormal.view", "import.view", "dataManagement.view", "backup.view"]);
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
test("回厂列表只将创建权限用于入口且不提前接入打印权限", () => {
  assert.match(source.returns, /return\.create/);
  assert.doesNotMatch(source.returns, /return\.print/);
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
test("回厂详情打印入口要求 return.print", () => assert.match(source.returnDetail, /return\.print/));
test("送货详情只调用一次页面权限助手", () => {
  assert.equal(occurrenceCount(source.deliveryDetail, 'requirePagePermission("delivery.view")'), 1);
});
test("送货详情不调用 requirePageUser", () => assert.doesNotMatch(source.deliveryDetail, /requirePageUser/));
test("送货详情不直接导入或读取 Cookie", () => assert.doesNotMatch(source.deliveryDetail, /next\/headers|cookies\(|document\.cookie/));
test("送货详情 notFound 位于权限检查之后", () => assertBefore(source.deliveryDetail, 'requirePagePermission("delivery.view")', "notFound()"));
test("送货详情打印入口要求 delivery.print", () => assert.match(source.deliveryDetail, /delivery\.print/));
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
test("剩余看板查询模块已删除", () => assert.doesNotMatch(source.dashboard, /remainingDashboardData(?:Promise)?/));
test("三个条件模块无权限时都返回 null", () => {
  for (const [start, end] of [
    ["const orderDataPromise", "const productionDataPromise"],
    ["const productionDataPromise", "const kittingDataPromise"],
    ["const kittingDataPromise", "const outsourceDataPromise"]
  ]) {
    assert.match(sourceSlice(source.dashboard, start, end), /Promise\.resolve\(null\)/);
  }
});
test("首页没有保留七项位置解构兼容代码", () => assert.doesNotMatch(source.dashboard, /\] = remainingDashboardData/));
test("原最后七项均已移入具名权限模块", () => {
  for (const name of ["deliverySummaryDataPromise", "deliveryDetailDataPromise", "drawingSummaryDataPromise", "noDrawingDetailDataPromise"]) assert.match(source.dashboard, new RegExp(`const ${name}`));
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
  const productionAbnormalData = sourceSlice(source.dashboard, "const productionAbnormalDataPromise", "const deliverySummaryDataPromise");
  assert.equal((productionAbnormalData.match(/prisma\./g) ?? []).length, 2);
});
test("四个新条件模块无权限时都返回 null", () => {
  for (const [start, end] of [
    ["const outsourceDataPromise", "const partialReturnDataPromise"],
    ["const partialReturnDataPromise", "const returnDataPromise"],
    ["const returnDataPromise", "const productionAbnormalDataPromise"],
    ["const productionAbnormalDataPromise", "const deliverySummaryDataPromise"]
  ]) {
    assert.match(sourceSlice(source.dashboard, start, end), /Promise\.resolve\(null\)/);
  }
});
test("顶层等待包含全部十一模块 Promise", () => {
  assert.match(source.dashboard, /orderDataPromise,\s+productionDataPromise,\s+kittingDataPromise,\s+outsourceDataPromise,\s+partialReturnDataPromise,\s+returnDataPromise,\s+productionAbnormalDataPromise,\s+deliverySummaryDataPromise,\s+deliveryDetailDataPromise,\s+drawingSummaryDataPromise,\s+noDrawingDetailDataPromise/);
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
test("送货汇总查看变量使用 delivery.view", () => assert.match(source.dashboard, /const canViewDeliverySummary = hasPermission\(user\.role, "delivery\.view", \[\]\)/));
test("送货明细查看变量同时要求送货、产品和订单查看权限", () => assert.match(source.dashboard, /const canViewDeliveryDetails = canViewDeliverySummary\s+&& hasPermission\(user\.role, "product\.view", \[\]\)\s+&& hasPermission\(user\.role, "order\.view", \[\]\)/));
test("待送货入口变量使用 delivery.create", () => assert.match(source.dashboard, /const canCreateDelivery = hasPermission\(user\.role, "delivery\.create", \[\]\)/));
test("图纸汇总查看变量使用 drawing.view", () => assert.match(source.dashboard, /const canViewDrawingSummary = hasPermission\(user\.role, "drawing\.view", \[\]\)/));
test("缺图明细查看变量同时要求图纸、部件和订单查看权限", () => assert.match(source.dashboard, /const canViewMissingDrawingDetails = canViewDrawingSummary\s+&& hasPermission\(user\.role, "part\.view", \[\]\)\s+&& hasPermission\(user\.role, "order\.view", \[\]\)/));
test("送货汇总条件模块严格包含一项 Prisma 查询", () => {
  const deliverySummary = sourceSlice(source.dashboard, "const deliverySummaryDataPromise", "const deliveryDetailDataPromise");
  assert.equal((deliverySummary.match(/prisma\./g) ?? []).length, 1);
});
test("送货明细条件模块严格包含两项 Prisma 查询", () => {
  const deliveryDetail = sourceSlice(source.dashboard, "const deliveryDetailDataPromise", "const drawingSummaryDataPromise");
  assert.equal((deliveryDetail.match(/prisma\./g) ?? []).length, 2);
});
test("图纸汇总条件模块严格包含两项 Prisma 查询", () => {
  const drawingSummary = sourceSlice(source.dashboard, "const drawingSummaryDataPromise", "const noDrawingDetailDataPromise");
  assert.equal((drawingSummary.match(/prisma\./g) ?? []).length, 2);
});
test("缺图明细条件模块严格包含两项 Prisma 查询", () => {
  const noDrawingDetail = sourceSlice(source.dashboard, "const noDrawingDetailDataPromise", "const [\n    orderData,");
  assert.equal((noDrawingDetail.match(/prisma\./g) ?? []).length, 2);
});
test("四个送货图纸模块无权限时都返回 null", () => {
  for (const [start, end] of [
    ["const deliverySummaryDataPromise", "const deliveryDetailDataPromise"],
    ["const deliveryDetailDataPromise", "const drawingSummaryDataPromise"],
    ["const drawingSummaryDataPromise", "const noDrawingDetailDataPromise"],
    ["const noDrawingDetailDataPromise", "const [\n    orderData,"]
  ]) {
    assert.match(sourceSlice(source.dashboard, start, end), /Promise\.resolve\(null\)/);
  }
});
test("deliverableProducts 仅存在于送货汇总模块查询中", () => {
  const deliverySummary = sourceSlice(source.dashboard, "const deliverySummaryDataPromise", "const deliveryDetailDataPromise");
  assert.match(deliverySummary, /deliverableProducts/);
  assert.doesNotMatch(sourceSlice(source.dashboard, "const deliveryDetailDataPromise", "const drawingSummaryDataPromise"), /deliverableProducts/);
});
test("送货待办两项仅存在于送货明细模块中", () => {
  const deliveryDetail = sourceSlice(source.dashboard, "const deliveryDetailDataPromise", "const drawingSummaryDataPromise");
  for (const name of ["deliveryTodoProductCount", "deliveryTodoProducts"]) assert.match(deliveryDetail, new RegExp(name));
});
test("图纸汇总两项仅存在于图纸汇总模块中", () => {
  const drawingSummary = sourceSlice(source.dashboard, "const drawingSummaryDataPromise", "const noDrawingDetailDataPromise");
  for (const name of ["partsWithoutDrawings", "thumbnailFailedDrawings"]) assert.match(drawingSummary, new RegExp(name));
});
test("缺图明细两项仅存在于缺图明细模块中", () => {
  const noDrawingDetail = sourceSlice(source.dashboard, "const noDrawingDetailDataPromise", "const [\n    orderData,");
  for (const name of ["missingDrawingPartCount", "missingDrawingParts"]) assert.match(noDrawingDetail, new RegExp(name));
});
test("送货汇总派生计算受 deliverySummaryData null 边界控制", () => {
  assert.match(source.dashboard, /const deliverySummary = deliverySummaryData === null\s+\? null/);
  assert.match(source.dashboard, /deliverySummaryData\.deliverableProducts\.filter/);
});
test("待送货统计卡受 deliverySummary null 边界控制", () => assert.match(source.dashboard, /\.\.\.\(deliverySummary !== null\s+\? \[\{\s+title: "待送货产品"/));
test("两张图纸统计卡受 drawingSummaryData null 边界控制", () => {
  assert.match(source.dashboard, /\.\.\.\(drawingSummaryData !== null/);
  for (const title of ["无图纸部件", "缩略图生成失败"]) assert.match(source.dashboard, new RegExp(`title: "${title}"`));
});
test("待送货待办受 deliveryDetailData null 边界控制", () => assert.match(source.dashboard, /\{deliveryDetailData !== null \? \(\s+<TodoCard title="待送货产品" count=\{deliveryDetailData\.deliveryTodoProductCount\}/));
test("缺图待办受 noDrawingDetailData null 边界控制", () => assert.match(source.dashboard, /\{noDrawingDetailData !== null \? \(\s+<TodoCard title="无图纸部件" count=\{noDrawingDetailData\.missingDrawingPartCount\}/));
test("待送货待办链接按 delivery.create 切换", () => assert.match(source.dashboard, /href=\{canCreateDelivery \? "\/delivery\/new" : "\/delivery"\}/));
test("送货与图纸无权限不使用可选链伪装数据", () => assert.doesNotMatch(source.dashboard, /(?:deliverySummaryData|deliveryDetailData|drawingSummaryData|noDrawingDetailData)\?\./));
test("delivery.create 不参与送货汇总查询条件", () => {
  const deliverySummary = sourceSlice(source.dashboard, "const deliverySummaryDataPromise", "const deliveryDetailDataPromise");
  assert.doesNotMatch(deliverySummary, /canCreateDelivery/);
});
test("delivery.create 不参与送货明细查询条件", () => {
  const deliveryDetail = sourceSlice(source.dashboard, "const deliveryDetailDataPromise", "const drawingSummaryDataPromise");
  assert.doesNotMatch(deliveryDetail, /canCreateDelivery/);
});
test("delivery.create 仅作为送货入口组合条件使用", () => assert.match(source.dashboard, /const canCreateDeliveryAction = canViewDeliverySummary && canCreateDelivery/));
test("新建订单同时要求订单查看和创建权限", () => assert.match(source.dashboard, /const canCreateOrders = canViewOrders && hasPermission\(user\.role, "order\.create", \[\]\)/));
test("生产进度入口复用生产查看权限", () => assert.match(source.dashboard, /\.\.\.\(canViewProduction \? \[\{ label: "生产进度", href: "\/production" \}\] : \[\]\)/));
test("新建外发单使用完整六项资源链权限", () => assert.match(source.dashboard, /const canCreateOutsourceOrder =\s+hasPermission\(user\.role, "order\.view", \[\]\) &&\s+hasPermission\(user\.role, "product\.view", \[\]\) &&\s+hasPermission\(user\.role, "part\.view", \[\]\) &&\s+hasPermission\(user\.role, "drawing\.view", \[\]\) &&\s+hasPermission\(user\.role, "outsource\.view", \[\]\) &&\s+hasPermission\(user\.role, "outsource\.create", \[\]\)/));
test("回厂登记使用完整七项创建资源链权限", () => assert.match(source.dashboard, /const canCreateOutsourceReturn =\s+hasPermission\(user\.role, "order\.view", \[\]\) &&\s+hasPermission\(user\.role, "product\.view", \[\]\) &&\s+hasPermission\(user\.role, "part\.view", \[\]\) &&\s+hasPermission\(user\.role, "drawing\.view", \[\]\) &&\s+hasPermission\(user\.role, "outsource\.view", \[\]\) &&\s+hasPermission\(user\.role, "return\.view", \[\]\) &&\s+hasPermission\(user\.role, "return\.create", \[\]\)/));
test("新建送货单同时要求送货查看和创建权限", () => assert.match(source.dashboard, /const canCreateDeliveryAction = canViewDeliverySummary && canCreateDelivery/));
test("系统备份要求 backup.view", () => assert.match(source.dashboard, /const canViewBackup = hasPermission\(user\.role, "backup\.view", \[\]\)/));
test("生产日报同时要求查看和打印权限", () => assert.match(source.dashboard, /const canPrintProductionDaily = hasPermission\(user\.role, "production\.daily\.view", \[\]\)\s+&& hasPermission\(user\.role, "production\.daily\.print", \[\]\)/));
test("生产异常清单同时要求查看和打印权限", () => assert.match(source.dashboard, /const canPrintProductionAbnormal = canViewProductionAbnormal\s+&& hasPermission\(user\.role, "production\.abnormal\.print", \[\]\)/));
test("生产进度跟踪表同时要求查看和打印权限", () => assert.match(source.dashboard, /const canPrintProductionProgress = canViewProduction\s+&& hasPermission\(user\.role, "production\.print", \[\]\)/));
test("常用操作数组按权限条件构造", () => {
  for (const gate of ["canCreateOrders", "canViewProduction", "canCreateOutsourceOrder", "canCreateOutsourceReturn", "canCreateDeliveryAction", "canViewBackup"]) assert.match(source.dashboard, new RegExp(`\\.\\.\\.\\(${gate} \\? \\[\\{ label:`));
});
test("常用打印数组按权限条件构造", () => {
  for (const gate of ["canPrintProductionDaily", "canPrintProductionAbnormal", "canPrintProductionProgress"]) assert.match(source.dashboard, new RegExp(`\\.\\.\\.\\(${gate} \\? \\[\\{ label:`));
});
test("常用入口可见状态由数组长度计算", () => {
  assert.match(source.dashboard, /const hasCommonActions = commonActionLinks\.length > 0/);
  assert.match(source.dashboard, /const hasCommonPrints = commonPrintLinks\.length > 0/);
});
test("两个入口区块都为空时不渲染外层容器", () => assert.match(source.dashboard, /\{hasCommonActions \|\| hasCommonPrints \? \(/));
test("常用操作为空时不渲染操作区块", () => assert.match(source.dashboard, /\{hasCommonActions \? \(\s+<section className=\{`\$\{card\} p-5`\}>/));
test("常用打印为空时不渲染打印区块", () => assert.match(source.dashboard, /\{hasCommonPrints \? \(\s+<section className=\{`\$\{card\} p-5`\}>/));
test("一个入口区块可见时使用单列布局", () => assert.match(source.dashboard, /: "xl:grid-cols-1"/));
test("两个入口区块可见时保持双列布局", () => assert.match(source.dashboard, /hasCommonActions && hasCommonPrints\s+\? "xl:grid-cols-\[2fr_1fr\]"/));
test("六个常用操作的文案和路由保持不变", () => {
  for (const [label, href] of [["新建订单", "/orders"], ["生产进度", "/production"], ["新建外发单", "/outsourcing/new"], ["回厂登记", "/returns"], ["新建送货单", "/delivery/new"], ["系统备份", "/settings/backup"]]) assert.match(source.dashboard, new RegExp(`label: "${label}", href: "${href.replaceAll("/", "\\/")}"`));
});
test("三个常用打印入口的文案和路由保持不变", () => {
  for (const [label, href] of [["生产日报", "/production/daily"], ["生产异常清单", "/production/abnormal"], ["生产进度跟踪表", "/production"]]) assert.match(source.dashboard, new RegExp(`label: "${label}", href: "${href.replaceAll("/", "\\/")}"`));
});
test("首页仍保持十一模块查询结构", () => {
  for (const name of ["orderDataPromise", "productionDataPromise", "kittingDataPromise", "outsourceDataPromise", "partialReturnDataPromise", "returnDataPromise", "productionAbnormalDataPromise", "deliverySummaryDataPromise", "deliveryDetailDataPromise", "drawingSummaryDataPromise", "noDrawingDetailDataPromise"]) assert.match(source.dashboard, new RegExp(`const ${name}`));
});
test("首页总 Prisma 查询仍为二十六项", () => assert.equal((source.dashboard.match(/prisma\./g) ?? []).length, 26));
test("首页 dashboard.view 仍早于首个 Prisma 查询", () => assertBefore(source.dashboard, 'requirePagePermission("dashboard.view")', "prisma."));
test("首页无角色硬编码与剩余查询模块", () => {
  assert.doesNotMatch(source.dashboard, /role\s*(?:===|!==)|\b(?:ADMIN|OWNER|SALES|PRODUCTION|OUTSOURCE|DELIVERY)\b/);
  assert.doesNotMatch(source.dashboard, /remainingDashboardData(?:Promise)?/);
});
test("外发详情页使用 outsource.view 页面权限", () => assert.match(source.outsourceDetail, /const user = await requirePagePermission\("outsource\.view"\)/));
test("外发详情页只调用一次 outsource.view", () => assert.equal(occurrenceCount(source.outsourceDetail, 'requirePagePermission("outsource.view")'), 1));
test("外发详情页查看权限早于 params", () => assertBefore(source.outsourceDetail, 'requirePagePermission("outsource.view")', "await params"));
test("外发详情页查看权限早于 Prisma", () => assertBefore(source.outsourceDetail, 'requirePagePermission("outsource.view")', "prisma.outsourceOrder.findFirst"));
test("外发详情页查看权限早于 notFound", () => assertBefore(source.outsourceDetail, 'requirePagePermission("outsource.view")', "notFound()"));
test("外发打印入口检查 outsource.print", () => assert.match(source.outsourceDetail, /hasPermission\(user\.role, "outsource\.print", \[\]\)/));
test("外发打印入口检查 drawing.view", () => assert.match(source.outsourceDetail, /hasPermission\(user\.role, "drawing\.view", \[\]\)/));
test("外发打印入口由 canPrintOutsource 条件渲染", () => assert.match(source.outsourceDetail, /\{canPrintOutsource \? \(\s+<Link\s+href=\{`\/outsourcing\/\$\{outsourceOrder\.id\}\/print`\}/));
test("外发详情页不使用图纸原件或图纸打印权限", () => assert.doesNotMatch(source.outsourceDetail, /drawing\.viewOriginal|drawing\.print/));
test("外发详情页不把创建资源权限升级为基础页面门禁", () => {
  assert.doesNotMatch(source.outsourceDetail, /requirePagePermission\("order\.view"\)|requirePageAllPermissions/);
});
test("外发详情页保留原打印 URL 与 Prisma 查询", () => {
  assert.match(source.outsourceDetail, /\/outsourcing\/\$\{outsourceOrder\.id\}\/print/);
  assert.match(source.outsourceDetail, /prisma\.outsourceOrder\.findFirst/);
});
test("回厂详情页保存 return.view 鉴权用户", () => assert.match(source.returnDetail, /const user = await requirePagePermission\("return\.view"\)/));
test("回厂详情页只调用一次 return.view", () => assert.equal(occurrenceCount(source.returnDetail, 'requirePagePermission("return.view")'), 1));
test("回厂打印入口检查 return.print", () => assert.match(source.returnDetail, /hasPermission\(user\.role, "return\.print", \[\]\)/));
test("回厂打印入口检查 drawing.view", () => assert.match(source.returnDetail, /hasPermission\(user\.role, "drawing\.view", \[\]\)/));
test("回厂打印入口由 canPrintReturn 条件渲染", () => assert.match(source.returnDetail, /\{canPrintReturn \? \(\s+<Link\s+className=.*?href=\{`\/returns\/\$\{returnOrder\.id\}\/print`\}/s));
test("回厂详情页不使用图纸原件或图纸打印权限", () => assert.doesNotMatch(source.returnDetail, /drawing\.viewOriginal|drawing\.print/));
test("回厂详情页查看权限仍早于 params、Prisma 和 notFound", () => {
  assertBefore(source.returnDetail, 'requirePagePermission("return.view")', "await params");
  assertBefore(source.returnDetail, 'requirePagePermission("return.view")', "prisma.outsourceReturn.findUnique");
  assertBefore(source.returnDetail, 'requirePagePermission("return.view")', "notFound()");
});
test("回厂详情页保留原打印 URL", () => assert.match(source.returnDetail, /\/returns\/\$\{returnOrder\.id\}\/print/));
test("送货详情页保存 delivery.view 鉴权用户", () => assert.match(source.deliveryDetail, /const user = await requirePagePermission\("delivery\.view"\)/));
test("送货详情页只调用一次 delivery.view", () => assert.equal(occurrenceCount(source.deliveryDetail, 'requirePagePermission("delivery.view")'), 1));
test("送货打印入口检查 delivery.print", () => assert.match(source.deliveryDetail, /hasPermission\(user\.role, "delivery\.print", \[\]\)/));
test("送货打印入口由 canPrintDelivery 条件渲染", () => assert.match(source.deliveryDetail, /\{canPrintDelivery \? \(\s+<Link\s+className=.*?href=\{`\/delivery\/\$\{deliveryOrder\.id\}\/print`\}/s));
test("送货详情页不要求图纸权限", () => assert.doesNotMatch(source.deliveryDetail, /drawing\.view(?:Original)?|drawing\.print/));
test("送货详情页不额外要求 order.view", () => assert.doesNotMatch(source.deliveryDetail, /order\.view/));
test("送货详情页查看权限仍早于 params、Prisma 和 notFound", () => {
  assertBefore(source.deliveryDetail, 'requirePagePermission("delivery.view")', "await params");
  assertBefore(source.deliveryDetail, 'requirePagePermission("delivery.view")', "prisma.deliveryOrder.findFirst");
  assertBefore(source.deliveryDetail, 'requirePagePermission("delivery.view")', "notFound()");
});
test("送货详情页保留原打印 URL 与 Prisma 查询", () => {
  assert.match(source.deliveryDetail, /\/delivery\/\$\{deliveryOrder\.id\}\/print/);
  assert.match(source.deliveryDetail, /prisma\.deliveryOrder\.findFirst/);
});
test("三个详情页均通过页面权限助手而非直接读取 Cookie 或 Session", () => {
  for (const key of ["outsourceDetail", "returnDetail", "deliveryDetail"]) {
    assert.match(source[key], /requirePagePermission/);
    assert.doesNotMatch(source[key], /next\/headers|cookies\(|document\.cookie|session/i);
  }
});
test("图纸导航和详情打印入口不使用角色硬编码", () => {
  for (const key of ["layout", "outsourceDetail", "returnDetail", "deliveryDetail"]) assert.doesNotMatch(source[key], /role\s*(?:===|!==)/);
});
test("订单详情页导入统一页面权限与权限判断助手", () => {
  assert.match(source.orderDetail, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/);
  assert.match(source.orderDetail, /import \{ hasPermission \} from "@\/lib\/permissions"/);
});
test("订单详情页首项权限为 order.view", () => assert.match(source.orderDetail, /const user = await requirePagePermission\("order\.view"\)/));
test("订单详情页只调用一次 order.view", () => assert.equal(occurrenceCount(source.orderDetail, 'requirePagePermission("order.view")'), 1));
test("订单详情页 order.view 早于 params", () => assertBefore(source.orderDetail, 'requirePagePermission("order.view")', "await params"));
test("订单详情页 order.view 早于订单 Prisma 查询", () => assertBefore(source.orderDetail, 'requirePagePermission("order.view")', "prisma.order.findFirst"));
test("订单详情页 order.view 早于客户 Prisma 查询", () => assertBefore(source.orderDetail, 'requirePagePermission("order.view")', "prisma.customer.findMany"));
test("订单详情页 order.view 早于 notFound", () => assertBefore(source.orderDetail, 'requirePagePermission("order.view")', "notFound()"));
test("订单详情页不重复认证或直接读取 Cookie、Session、角色", () => assert.doesNotMatch(source.orderDetail, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i));
test("订单详情页计算 canViewDrawings", () => assert.match(source.orderDetail, /const canViewDrawings = hasPermission\(user\.role, "drawing\.view", \[\]\)/));
test("订单详情页计算 canViewOriginalDrawings 的组合权限", () => assert.match(source.orderDetail, /const canViewOriginalDrawings =\s+canViewDrawings && hasPermission\(user\.role, "drawing\.viewOriginal", \[\]\)/));
test("订单详情页计算 canPrintOrder 的组合权限", () => assert.match(source.orderDetail, /const canPrintOrder =\s+canViewDrawings && hasPermission\(user\.role, "order\.print", \[\]\)/));
test("订单详情页将三个只读权限标志传入 Client Manager", () => {
  for (const name of ["canViewDrawings", "canViewOriginalDrawings", "canPrintOrder"]) assert.match(source.orderDetail, new RegExp(`${name}=\\{${name}\\}`));
});
test("订单详情页以 canViewDrawings 条件查询 drawings 关系", () => assert.match(source.orderDetail, /drawings: canViewDrawings\s+\? \{/));
test("订单详情页无图纸查看权限时不查询 drawings", () => assert.match(source.orderDetail, /drawings: canViewDrawings[\s\S]*?: false,/));
test("订单详情页图纸查询保持既有排序", () => assert.match(source.orderDetail, /orderBy: \[\{ isMain: "desc" \}, \{ version: "desc" \}, \{ createdAt: "desc" \}\]/));
test("订单详情页图纸 DTO 显式选择当前所需字段", () => {
  for (const field of ["id", "fileName", "fileType", "originalUrl", "thumbnailUrl", "printThumbnailUrl", "version", "isMain", "status", "uploadStatus", "errorMessage", "remark"]) assert.match(source.orderDetail, new RegExp(`${field}: true`));
});
test("订单详情页不展开完整 Prisma drawing 对象", () => assert.doesNotMatch(source.orderDetail, /\.\.\.drawing/));
test("受保护图纸 URL 仅在可查看图纸分支构造", () => assert.match(source.orderDetail, /drawings: canViewDrawings[\s\S]*?\? part\.drawings\.map[\s\S]*?withProtectedDrawingUrls\(drawing\)[\s\S]*?: \[\]/));
test("无图纸查看权限时 Client DTO 规范化为空数组", () => assert.match(source.orderDetail, /drawings: canViewDrawings[\s\S]*?: \[\],/));
test("Client Manager Props 包含三个只读权限标志", () => {
  for (const name of ["canViewDrawings", "canViewOriginalDrawings", "canPrintOrder"]) assert.match(source.orderManager, new RegExp(`${name}: boolean`));
});
test("订单打印入口受 canPrintOrder 条件渲染", () => assert.match(source.orderManager, /\{canPrintOrder \? \(\s+<Link[\s\S]*?\/orders\/\$\{order\.id\}\/print/));
test("图纸汇总数量受 canViewDrawings 控制", () => assert.match(source.orderManager, /const drawingCount = canViewDrawings\s+\? product\.parts\.reduce/));
test("部件图纸数量与图纸列受 canViewDrawings 控制", () => {
  assert.match(source.orderManager, /\{canViewDrawings \? <th className=\{tableHeaderCell\}>图纸<\/th> : null\}/);
  assert.match(source.orderManager, /\{canViewDrawings \? <td className=\{tableCell\}>\{part\.drawings\.length\}<\/td> : null\}/);
});
test("无图纸查看权限显示中性提示", () => assert.match(source.orderManager, /!canViewDrawings \? <div[\s\S]*?>无图纸查看权限<\/div> : null/));
test("无权限提示与暂无图纸空状态分离", () => assert.match(source.orderManager, /canViewDrawings && part\.drawings\.length === 0/));
test("图纸表格仅在 canViewDrawings 时渲染", () => assert.match(source.orderManager, /\) : canViewDrawings \? \(/));
test("原件链接受 canViewOriginalDrawings 控制", () => assert.match(source.orderManager, /\{canViewOriginalDrawings \? \(\s+<a href=\{drawing\.originalUrl\}/));
test("查看原图入口受 canViewOriginalDrawings 控制", () => assert.match(source.orderManager, /\{canViewOriginalDrawings \? <a className=.*?href=\{drawing\.originalUrl\}/));
test("无原件权限时缩略图仍直接渲染", () => assert.match(source.orderManager, /\) : renderDrawingPreview\(drawing\)\}/));
test("图纸写函数和刷新函数仍存在", () => {
  for (const name of ["uploadDrawings", "updateDrawingStatus", "setMainDrawing", "obsoleteDrawing", "refreshWithMessage"]) assert.match(source.orderManager, new RegExp(`function ${name}|async function ${name}`));
});
test("图纸写 API 地址和方法保持不变", () => {
  assert.match(source.orderManager, /fetch\(`\/api\/parts\/\$\{part\.id\}\/drawings`, \{\s+method: "POST"/);
  assert.match(source.orderManager, /fetch\(`\/api\/drawings\/\$\{drawing\.id\}`, \{\s+method: "PATCH"/);
  assert.match(source.orderManager, /fetch\(`\/api\/drawings\/\$\{drawing\.id\}\/main`, \{ method: "POST" \}\)/);
  assert.match(source.orderManager, /fetch\(`\/api\/drawings\/\$\{drawing\.id\}`, \{ method: "DELETE" \}\)/);
});
test("图纸上传中心链接继续保留", () => assert.match(source.orderManager, /\/orders\/\$\{order\.id\}\/drawings\/upload-center/));
test("订单详情页与 Client Manager 仅新增 C3d-1 的四个图纸写权限标志", () => {
  for (const flag of ["canUploadDrawing", "canUpdateDrawing", "canSetMainDrawing", "canObsoleteDrawing"]) {
    assert.match(source.orderDetail, new RegExp(flag));
    assert.match(source.orderManager, new RegExp(flag));
  }
  assert.doesNotMatch(source.orderDetail, /canCreateDrawing|canDeleteDrawing/);
  assert.doesNotMatch(source.orderManager, /canCreateDrawing|canDeleteDrawing/);
});
test("订单详情页计算 order.update 且使用空覆盖", () => assert.match(source.orderDetail, /const canUpdateOrder = hasPermission\(user\.role, "order\.update", \[\]\)/));
test("订单详情页计算产品创建组合权限且使用空覆盖", () => {
  assert.match(source.orderDetail, /const canCreateProduct =\s+hasPermission\(user\.role, "product\.view", \[\]\) &&\s+hasPermission\(user\.role, "product\.create", \[\]\)/);
});
test("订单详情页计算产品更新组合权限且使用空覆盖", () => {
  assert.match(source.orderDetail, /const canUpdateProduct =\s+hasPermission\(user\.role, "product\.view", \[\]\) &&\s+hasPermission\(user\.role, "product\.update", \[\]\)/);
});
test("订单详情页计算产品删除组合权限且使用空覆盖", () => {
  assert.match(source.orderDetail, /const canDeleteProduct =\s+hasPermission\(user\.role, "product\.view", \[\]\) &&\s+hasPermission\(user\.role, "product\.delete", \[\]\)/);
});
test("订单详情页计算部件创建完整资源链权限且使用空覆盖", () => {
  assert.match(source.orderDetail, /const canCreatePart =\s+hasPermission\(user\.role, "product\.view", \[\]\) &&\s+hasPermission\(user\.role, "part\.view", \[\]\) &&\s+hasPermission\(user\.role, "part\.create", \[\]\)/);
});
test("订单详情页计算部件更新组合权限且使用空覆盖", () => {
  assert.match(source.orderDetail, /const canUpdatePart =\s+hasPermission\(user\.role, "part\.view", \[\]\) &&\s+hasPermission\(user\.role, "part\.update", \[\]\)/);
});
test("订单详情页计算部件删除组合权限且使用空覆盖", () => {
  assert.match(source.orderDetail, /const canDeletePart =\s+hasPermission\(user\.role, "part\.view", \[\]\) &&\s+hasPermission\(user\.role, "part\.delete", \[\]\)/);
});
test("订单详情页只向 Manager 传入批准的写权限 Boolean", () => {
  const managerProps = sourceSlice(source.orderDetail, "<OrderDetailManager", "/>" );
  for (const name of [
    "canUpdateOrder",
    "canCreateProduct",
    "canUpdateProduct",
    "canDeleteProduct",
    "canCreatePart",
    "canUpdatePart",
    "canDeletePart"
  ]) {
    assert.match(managerProps, new RegExp(`${name}=\\{${name}\\}`));
  }
  assert.doesNotMatch(managerProps, /canCreateOrder|canDeleteOrder|role=|permissions?=|user=|overrides=/i);
});
test("订单详情 Manager 声明产品和部件的独立写权限 Boolean", () => {
  for (const name of [
    "canCreateProduct",
    "canUpdateProduct",
    "canDeleteProduct",
    "canCreatePart",
    "canUpdatePart",
    "canDeletePart"
  ]) {
    assert.match(source.orderManager, new RegExp(`${name}: boolean`));
  }
  assert.doesNotMatch(source.orderManager, /\brole\s*:|permissions?\s*:|overrides\s*:/i);
});
test("订单基本信息编辑按钮由 canUpdateOrder 条件渲染", () => assert.match(source.orderManager, /\{canUpdateOrder \? \([\s\S]*?编辑订单[\s\S]*?\) : null\}/));
test("订单详情编辑模式入口有防御性权限检查", () => assert.match(functionBody(source.orderManager, "function startEditOrder"), /if \(!canUpdateOrder\) return/));
test("订单详情编辑表单同时受权限和编辑模式控制", () => assert.match(source.orderManager, /\{canUpdateOrder && isEditingOrder \? \(\s*<section[\s\S]*?编辑订单基本信息/));
test("订单详情保存处理函数有更新权限防御", () => assert.match(functionBody(source.orderManager, "async function saveOrder"), /if \(!canUpdateOrder \|\| !isEditingOrder\) return/));
test("产品表单按创建或编辑模式分别进行 DOM 过滤", () => {
  assert.match(source.orderManager, /\{\(editingProductId \? canUpdateProduct : canCreateProduct\) \? \(\s*<section[\s\S]*?<form className="mt-4 grid gap-4 lg:grid-cols-3" onSubmit=\{saveProduct\}>/);
});
test("产品编辑按钮仅在 canUpdateProduct 时进入 DOM", () => {
  assert.match(source.orderManager, /\{canUpdateProduct \? <button[\s\S]*?onClick=\{\(\) => startEditProduct\(product\)\}>编辑<\/button> : null\}/);
});
test("产品删除按钮和确认入口仅在 canDeleteProduct 时可达", () => {
  assert.match(source.orderManager, /\{canDeleteProduct \? <button[\s\S]*?onClick=\{\(\) => deleteProduct\(product\)\}>删除<\/button> : null\}/);
  const handler = functionBody(source.orderManager, "async function deleteProduct");
  assertBefore(handler, "if (!canDeleteProduct) return", "window.confirm");
});
test("产品编辑模式入口有更新权限防御", () => {
  assert.match(functionBody(source.orderManager, "function startEditProduct"), /if \(!canUpdateProduct\) return/);
});
test("产品保存处理函数按创建和更新模式分别防御", () => {
  assert.match(
    functionBody(source.orderManager, "async function saveProduct"),
    /if \(editingProductId \? !canUpdateProduct : !canCreateProduct\) return/
  );
});
test("产品权限不使用 disabled 或 CSS 隐藏替代 DOM 过滤", () => {
  assert.doesNotMatch(source.orderManager, /disabled=\{!?can(?:Create|Update|Delete)Product\}/);
  assert.doesNotMatch(source.orderManager, /(?:hidden|invisible|opacity|pointer-events)[\s\S]{0,120}can(?:Create|Update|Delete)Product|can(?:Create|Update|Delete)Product[\s\S]{0,120}(?:hidden|invisible|pointer-events)/);
});
test("产品权限没有接管部件创建编辑删除或整件入口", () => {
  for (const name of ["startAddPart", "startEditPart", "savePart", "deletePart", "createWholeProductPart"]) {
    assert.doesNotMatch(functionBody(source.orderManager, `${name === "savePart" || name === "deletePart" || name === "createWholeProductPart" ? "async " : ""}function ${name}`), /can(?:Create|Update|Delete)Product/);
  }
  assert.equal(occurrenceCount(source.orderManager, 'onClick={() => startAddPart(product)}>新增部件</button>'), 2);
});
test("产品权限没有接管图纸生产齐套或导入入口", () => {
  for (const name of ["uploadDrawings", "updateDrawingStatus", "setMainDrawing", "obsoleteDrawing", "markProductionComplete"]) {
    assert.doesNotMatch(functionBody(source.orderManager, `async function ${name}`), /can(?:Create|Update|Delete)Product/);
  }
  const importAndDrawingLinks = sourceSlice(
    source.orderManager,
    'href={`/orders/${order.id}/import-products`}',
    'href={`/orders/${order.id}/drawings/upload-center`}'
  );
  assert.doesNotMatch(importAndDrawingLinks, /can(?:Create|Update|Delete)Product/);
  assert.match(source.orderManager, /href=\{`\/kitting\?productId=\$\{product\.id\}`\}>齐套检查<\/Link>/);
});
test("普通新增部件和创建整件入口均由 canCreatePart 进行 DOM 过滤", () => {
  assert.equal(
    occurrenceCount(source.orderManager, '{canCreatePart ? <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" onClick={() => startAddPart(product)}>新增部件</button> : null}'),
    2
  );
  assert.match(source.orderManager, /\{canCreatePart \? \(\s+<button[\s\S]*?onClick=\{\(\) => createWholeProductPart\(product\)\}[\s\S]*?设为整件产品[\s\S]*?\) : null\}/);
});
test("新增部件和创建整件处理函数均先防御创建权限", () => {
  assert.match(functionBody(source.orderManager, "function startAddPart"), /if \(!canCreatePart\) return/);
  const wholePartHandler = functionBody(source.orderManager, "async function createWholeProductPart");
  assertBefore(wholePartHandler, "if (!canCreatePart) return", "window.alert");
  assertBefore(wholePartHandler, "if (!canCreatePart) return", "window.confirm");
});
test("部件编辑按钮和编辑模式入口由 canUpdatePart 独立控制", () => {
  assert.match(source.orderManager, /\{canUpdatePart \? <button[\s\S]*?onClick=\{\(\) => startEditPart\(product, part\)\}>编辑<\/button> : null\}/);
  assert.match(functionBody(source.orderManager, "function startEditPart"), /if \(!canUpdatePart\) return/);
});
test("部件删除按钮和确认入口由 canDeletePart 独立控制", () => {
  assert.match(source.orderManager, /\{canDeletePart \? <button[\s\S]*?onClick=\{\(\) => deletePart\(part\)\}>删除<\/button> : null\}/);
  const deleteHandler = functionBody(source.orderManager, "async function deletePart");
  assertBefore(deleteHandler, "if (!canDeletePart) return", "window.confirm");
});
test("部件保存函数按创建和更新模式分别防御", () => {
  assert.match(
    functionBody(source.orderManager, "async function savePart"),
    /if \(editingPartId \? !canUpdatePart : !canCreatePart\) return/
  );
});
test("部件表单按创建或编辑模式进行 DOM 过滤", () => {
  const renderPartForm = functionBody(source.orderManager, "function renderPartForm");
  assert.match(renderPartForm, /activePartProductId !== product\.id \|\|\s+\(editingPartId \? !canUpdatePart : !canCreatePart\)/);
  assertBefore(renderPartForm, "(editingPartId ? !canUpdatePart : !canCreatePart)", "return (");
});
test("部件三个权限互相独立且不使用 disabled 或 CSS 隐藏替代 DOM 过滤", () => {
  assert.doesNotMatch(source.orderManager, /disabled=\{!?can(?:Create|Update|Delete)Part\}/);
  assert.doesNotMatch(source.orderManager, /(?:hidden|invisible|opacity|pointer-events)[\s\S]{0,120}can(?:Create|Update|Delete)Part|can(?:Create|Update|Delete)Part[\s\S]{0,120}(?:hidden|invisible|pointer-events)/);
  assert.doesNotMatch(functionBody(source.orderManager, "function startAddPart"), /canUpdatePart|canDeletePart/);
  assert.doesNotMatch(functionBody(source.orderManager, "function startEditPart"), /canCreatePart|canDeletePart/);
  assert.doesNotMatch(functionBody(source.orderManager, "async function deletePart"), /canCreatePart|canUpdatePart/);
});
test("部件权限没有接管图纸生产齐套或导入入口", () => {
  for (const name of ["uploadDrawings", "updateDrawingStatus", "setMainDrawing", "obsoleteDrawing", "markProductionComplete"]) {
    assert.doesNotMatch(functionBody(source.orderManager, `async function ${name}`), /can(?:Create|Update|Delete)Part/);
  }
  assert.match(source.orderManager, /href=\{`\/kitting\?productId=\$\{product\.id\}`\}>齐套检查<\/Link>/);
});
test("Client数量解析只接受规范十进制正整数并限制Prisma Int上限", () => {
  const parser = functionBody(source.orderManager, "function parsePositiveIntegerInput");
  assert.match(parser, /\/\^\[1-9\]\\d\*\$\//);
  assert.match(parser, /Number\.isSafeInteger\(quantity\)/);
  assert.match(parser, /quantity <= prismaIntMax/);
});
test("产品保存使用严格数量校验和显式请求体", () => {
  const handler = functionBody(source.orderManager, "async function saveProduct");
  assert.match(handler, /parsePositiveIntegerInput\(productForm\.quantity\)/);
  assert.match(handler, /quantity,\s+surfaceTreatment/);
  assert.match(handler, /body: JSON\.stringify\(productRequestBody\)/);
  assert.doesNotMatch(handler, /JSON\.stringify\(productForm\)|productPart|totalQuantity/);
});
test("部件保存严格校验单套和产品数量", () => {
  const handler = functionBody(source.orderManager, "async function savePart");
  assert.match(handler, /parsePositiveIntegerInput\(partForm\.unitQuantity\)/);
  assert.match(handler, /parsePositiveIntegerInput\(partForm\.productQuantity\)/);
});
test("新增普通部件清空产品数量时完全省略该属性", () => {
  const handler = functionBody(source.orderManager, "async function savePart");
  assert.match(handler, /const useDefaultProductQuantity = !editingPartId && partForm\.productQuantity === ""/);
  assert.match(handler, /\.\.\.\(productQuantity === undefined \? \{\} : \{ productQuantity \}\)/);
  assert.match(handler, /body: JSON\.stringify\(partRequestBody\)/);
  assert.doesNotMatch(handler, /JSON\.stringify\(partForm\)/);
});
test("部件请求体不提交totalQuantity或三个累计数量", () => {
  const handler = functionBody(source.orderManager, "async function savePart");
  for (const field of ["totalQuantity", "outsourcedQuantity", "returnedQuantity", "missingQuantity", "status"]) {
    assert.doesNotMatch(handler, new RegExp(`${field}\\s*:`));
  }
});
test("产品和部件数量输入保留HTML正整数边界", () => {
  assert.equal(occurrenceCount(source.orderManager, 'type="number" min="1" max={prismaIntMax} step="1"'), 3);
});
test("部件编辑表单不显示或编辑totalQuantity", () => {
  const form = functionBody(source.orderManager, "function renderPartForm");
  assert.doesNotMatch(form, /partTotalQuantity|calculatedTotalQuantity|readOnly[\s\S]*?应加工数量|应加工数量[\s\S]*?readOnly/);
});
test("订单详情状态继续只读显示", () => {
  assert.match(source.orderManager, /订单状态<\/dt><dd className="mt-1">\{getOrderStatusLabel\(order\.status\)\}<\/dd>/);
});
test("订单详情编辑表单不再包含状态控件", () => {
  const editForm = sourceSlice(source.orderManager, '<form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={saveOrder}>', "</form>");
  assert.doesNotMatch(editForm, /订单状态|orderForm\.status|updateOrderField\("status"/);
});
test("订单详情编辑 state 和重置函数不再包含 status", () => {
  const orderFormType = sourceSlice(source.orderManager, "type OrderForm = {", "};");
  const initialState = sourceSlice(source.orderManager, "const [orderForm, setOrderForm]", "const [productForm");
  const cancelEditOrder = functionBody(source.orderManager, "function cancelEditOrder");
  for (const section of [orderFormType, initialState, cancelEditOrder]) assert.doesNotMatch(section, /\bstatus\b/);
});
test("订单详情 PUT 请求体不再提交 status", () => {
  const saveOrder = functionBody(source.orderManager, "async function saveOrder");
  assert.match(saveOrder, /fetch\(`\/api\/orders\/\$\{order\.id\}`[\s\S]*?method: "PUT"/);
  assert.match(saveOrder, /body: JSON\.stringify\(orderForm\)/);
  assert.doesNotMatch(saveOrder, /orderForm\.status|\bstatus\s*:/);
});
test("订单更新权限未误用于产品部件图纸和导入入口", () => {
  for (const marker of ["saveProduct", "savePart", "uploadDrawing", "import-products", "drawings/upload-center"]) assert.match(source.orderManager, new RegExp(marker.replace("/", "\\/")));
  assert.doesNotMatch(functionBody(source.orderManager, "async function saveProduct"), /canUpdateOrder/);
  assert.doesNotMatch(functionBody(source.orderManager, "async function savePart"), /canUpdateOrder/);
});
test("订单详情权限不使用 disabled 或 CSS 隐藏替代 DOM 过滤", () => {
  assert.doesNotMatch(source.orderManager, /disabled=\{!?canUpdateOrder\}/);
  assert.doesNotMatch(source.orderManager, /(?:hidden|invisible)[\s\S]{0,120}canUpdateOrder|canUpdateOrder[\s\S]{0,120}(?:hidden|invisible)/);
});
test("生产进度页导入统一页面权限与权限判断助手", () => {
  assert.match(source.production, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/);
  assert.match(source.production, /import \{ hasPermission \} from "@\/lib\/permissions"/);
});
test("生产进度页只要求一次 production.view", () => {
  assert.equal(occurrenceCount(source.production, 'requirePagePermission("production.view")'), 1);
});
test("生产进度页查看权限早于参数处理和 Prisma", () => {
  assertBefore(source.production, 'requirePagePermission("production.view")', "await searchParams");
  assertBefore(source.production, 'requirePagePermission("production.view")', "prisma.product.findMany");
});
test("生产进度页不重复认证、不读取会话且无角色硬编码", () => {
  assert.doesNotMatch(source.production, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i);
});
test("生产进度页计算 production.print 官方按钮权限", () => {
  assert.match(source.production, /const canPrintProduction = hasPermission\(user\.role, "production\.print", \[\]\)/);
});
test("生产进度页将打印权限布尔值传入 Client Manager", () => {
  assert.match(source.production, /<ProductionManager[\s\S]*?canPrintProduction=\{canPrintProduction\}/);
});
test("ProductionManager 声明并接收打印权限 prop", () => {
  assert.match(source.productionManager, /canPrintProduction: boolean/);
  assert.match(source.productionManager, /products,[\s\S]*?filters,[\s\S]*?canPrintProduction/);
});
test("生产进度官方打印按钮受明确 JSX 权限边界控制", () => {
  const header = sourceSlice(source.productionManager, '<div className="flex flex-wrap gap-3">', "</div>\n      </section>");
  assert.match(header, /\{canPrintProduction \? \([\s\S]*?打印生产进度跟踪表[\s\S]*?\) : null\}/);
});
test("生产进度打印仍调用原 window.print 且未用 disabled 替代", () => {
  const header = sourceSlice(source.productionManager, '<div className="flex flex-wrap gap-3">', "</div>\n      </section>");
  assert.match(header, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.doesNotMatch(header, /disabled=|hidden|className=.*(?:hidden|invisible)/);
});
test("生产日报页导入统一页面权限与权限判断助手", () => {
  assert.match(source.productionDaily, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/);
  assert.match(source.productionDaily, /import \{ hasPermission \} from "@\/lib\/permissions"/);
});
test("生产日报页只要求一次 production.daily.view", () => {
  assert.equal(occurrenceCount(source.productionDaily, 'requirePagePermission("production.daily.view")'), 1);
});
test("生产日报查看权限早于参数处理和 Prisma", () => {
  assertBefore(source.productionDaily, 'requirePagePermission("production.daily.view")', "await searchParams");
  assertBefore(source.productionDaily, 'requirePagePermission("production.daily.view")', "prisma.productPartProgressLog.findMany");
});
test("生产日报页不重复认证、不读取会话且无角色硬编码", () => {
  assert.doesNotMatch(source.productionDaily, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i);
});
test("生产日报页计算 production.daily.print 官方按钮权限", () => {
  assert.match(source.productionDaily, /const canPrintDaily = hasPermission\(user\.role, "production\.daily\.print", \[\]\)/);
});
test("生产日报官方打印按钮由 Server Component 条件渲染", () => {
  const header = sourceSlice(source.productionDaily, '<div className="flex flex-wrap items-center gap-3">', "</div>\n      </section>");
  assert.match(header, /\{canPrintDaily \? <DailyPrintButton \/> : null\}/);
});
test("生产日报按钮保持原 window.print 行为且不读取权限", () => {
  assert.match(source.dailyPrintButton, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.doesNotMatch(source.dailyPrintButton, /cookies\(|document\.cookie|session|hasPermission|requirePagePermission|role\s*(?:===|!==)/i);
});
test("生产日报查询与打印样式仍保留", () => {
  assert.match(source.productionDaily, /prisma\.productPartProgressLog\.findMany/);
  assert.match(source.productionDaily, /@media print/);
});
test("生产异常页导入统一页面权限与权限判断助手", () => {
  assert.match(source.productionAbnormal, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/);
  assert.match(source.productionAbnormal, /import \{ hasPermission \} from "@\/lib\/permissions"/);
});
test("生产异常页只要求一次 production.abnormal.view", () => {
  assert.equal(occurrenceCount(source.productionAbnormal, 'requirePagePermission("production.abnormal.view")'), 1);
});
test("生产异常查看权限早于参数处理和 Prisma", () => {
  assertBefore(source.productionAbnormal, 'requirePagePermission("production.abnormal.view")', "await searchParams");
  assertBefore(source.productionAbnormal, 'requirePagePermission("production.abnormal.view")', "prisma.productPartAbnormal.findMany");
});
test("生产异常页不重复认证、不读取会话且无角色硬编码", () => {
  assert.doesNotMatch(source.productionAbnormal, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i);
});
test("生产异常页计算 production.abnormal.print 官方按钮权限", () => {
  assert.match(source.productionAbnormal, /const canPrintAbnormal = hasPermission\(user\.role, "production\.abnormal\.print", \[\]\)/);
});
test("生产异常官方打印按钮由 Server Component 条件渲染", () => {
  const header = sourceSlice(source.productionAbnormal, '<div className="flex flex-wrap items-center gap-3">', "</div>\n      </section>");
  assert.match(header, /\{canPrintAbnormal \? <AbnormalPrintButton \/> : null\}/);
});
test("生产异常按钮保持原 window.print 行为且不读取权限", () => {
  assert.match(source.abnormalPrintButton, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.doesNotMatch(source.abnormalPrintButton, /cookies\(|document\.cookie|session|hasPermission|requirePagePermission|role\s*(?:===|!==)/i);
});
test("生产异常查询与打印样式仍保留", () => {
  assert.match(source.productionAbnormal, /prisma\.productPartAbnormal\.findMany/);
  assert.match(source.productionAbnormal, /@media print/);
});
test("六个生产查看与打印权限键均为合法权限", () => {
  for (const permission of ["production.view", "production.print", "production.daily.view", "production.daily.print", "production.abnormal.view", "production.abnormal.print"]) assert.equal(isPermission(permission), true);
});
test("生产 Client Component 不读取 Cookie、Session 或角色", () => {
  for (const key of ["productionManager", "dailyPrintButton", "abnormalPrintButton"]) assert.doesNotMatch(source[key], /cookies\(|document\.cookie|session|role\s*(?:===|!==)/i);
});
test("生产同页打印不使用 CSS 隐藏官方按钮替代权限分支", () => {
  assert.doesNotMatch(source.productionManager, /canPrintProduction[\s\S]{0,200}className=.*(?:hidden|invisible)/);
  assert.doesNotMatch(source.productionDaily, /canPrintDaily[\s\S]{0,200}className=.*(?:hidden|invisible)/);
  assert.doesNotMatch(source.productionAbnormal, /canPrintAbnormal[\s\S]{0,200}className=.*(?:hidden|invisible)/);
});
const customerPageBody = functionBody(source.customers, "export default async function CustomersPage");
const ordersPageBody = functionBody(source.orders, "export default async function OrdersPage");
const outsourcingPageBody = functionBody(source.outsourcing, "export default async function OutsourcingPage");
const deliveryPageBody = functionBody(source.delivery, "export default async function DeliveryPage");
const kittingPageBody = functionBody(source.kitting, "export default async function KittingPage");
const excelImportPageBody = functionBody(source.excelImport, "export default async function ExcelImportPage");
const backupPageBody = functionBody(source.backupPage, "export default async function BackupPage");

test("客户列表导入页面权限助手", () => assert.match(source.customers, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/));
test("客户列表只要求一次 customer.view", () => assert.equal(occurrenceCount(customerPageBody, 'requirePagePermission("customer.view")'), 1));
test("客户列表鉴权早于 Prisma 查询", () => assertBefore(customerPageBody, 'requirePagePermission("customer.view")', "prisma.customer.findMany"));
test("客户列表不重复认证、不读取会话且无角色硬编码", () => assert.doesNotMatch(customerPageBody, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i));
test("客户列表保留原客户查询、排序和订单数量", () => {
  assert.match(customerPageBody, /prisma\.customer\.findMany/);
  assert.match(customerPageBody, /orderBy: \{ createdAt: "desc" \}/);
  assert.match(customerPageBody, /_count: \{ select: \{ orders: true \} \}/);
});
test("客户页面复用 customer.view 鉴权返回的安全用户", () => assert.match(customerPageBody, /const user = await requirePagePermission\("customer\.view"\)/));
test("客户页面导入纯权限判断函数", () => assert.match(source.customers, /import \{ hasPermission \} from "@\/lib\/permissions"/));
test("客户页面计算 view 加 create 组合权限", () => assert.match(customerPageBody, /const canCreateCustomer =\s*hasPermission\(user\.role, "customer\.view", \[\]\) && hasPermission\(user\.role, "customer\.create", \[\]\)/));
test("客户页面计算 view 加 update 组合权限", () => assert.match(customerPageBody, /const canUpdateCustomer =\s*hasPermission\(user\.role, "customer\.view", \[\]\) && hasPermission\(user\.role, "customer\.update", \[\]\)/));
test("客户页面计算 view 加 delete 组合权限", () => assert.match(customerPageBody, /const canDeleteCustomer =\s*hasPermission\(user\.role, "customer\.view", \[\]\) && hasPermission\(user\.role, "customer\.delete", \[\]\)/));
test("客户页面向 Manager 只传三个写权限 Boolean", () => {
  const managerProps = sourceSlice(customerPageBody, "<CustomerManager", "/>" );
  for (const prop of ["canCreateCustomer", "canUpdateCustomer", "canDeleteCustomer"]) assert.match(managerProps, new RegExp(`${prop}=\\{${prop}\\}`));
  assert.doesNotMatch(managerProps, /role=|permissions?=|user=/i);
});
test("CustomerManager 只声明三个最小权限 Boolean", () => {
  for (const prop of ["canCreateCustomer", "canUpdateCustomer", "canDeleteCustomer"]) assert.match(source.customerManager, new RegExp(`${prop}: boolean`));
  assert.doesNotMatch(source.customerManager, /\brole\s*:|permissions?\s*:/i);
});
test("无新增权限时新增表单不进入 DOM", () => assert.match(source.customerManager, /\(isEditing \? canUpdateCustomer : canCreateCustomer\) \? \(\s*<section/));
test("编辑按钮由 canUpdateCustomer 条件渲染", () => assert.match(source.customerManager, /\{canUpdateCustomer \? \([\s\S]*?编辑[\s\S]*?\) : null\}/));
test("删除按钮由 canDeleteCustomer 条件渲染", () => assert.match(source.customerManager, /\{canDeleteCustomer \? \([\s\S]*?删除[\s\S]*?\) : null\}/));
test("客户写权限不使用 disabled 或 CSS 隐藏替代 DOM 过滤", () => {
  assert.doesNotMatch(source.customerManager, /disabled=\{!?can(?:Create|Update|Delete)Customer\}/);
  assert.doesNotMatch(source.customerManager, /(?:hidden|invisible)[\s\S]{0,120}can(?:Create|Update|Delete)Customer|can(?:Create|Update|Delete)Customer[\s\S]{0,120}(?:hidden|invisible)/);
});
test("CustomerManager 不读取用户、权限 API、Cookie 或 Session", () => assert.doesNotMatch(source.customerManager, /hasPermission|requirePage|\/api\/auth\/me|cookies\(|document\.cookie|session|\brole\b/i));
test("客户请求地址、方法和刷新流程保持不变", () => {
  assert.match(source.customerManager, /const url = isEditing \? `\/api\/customers\/\$\{editingId\}` : "\/api\/customers"/);
  assert.match(source.customerManager, /const method = isEditing \? "PUT" : "POST"/);
  assert.match(source.customerManager, /fetch\(`\/api\/customers\/\$\{customer\.id\}`, \{ method: "DELETE" \}\)/);
  assert.match(source.customerManager, /startTransition\(\(\) => router\.refresh\(\)\)/);
});

test("订单列表导入页面权限助手", () => assert.match(source.orders, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/));
test("订单列表只要求一次 order.view", () => assert.equal(occurrenceCount(ordersPageBody, 'requirePagePermission("order.view")'), 1));
test("订单列表鉴权早于参数和全部 Prisma 查询", () => {
  assertBefore(ordersPageBody, 'requirePagePermission("order.view")', "await searchParams");
  assertBefore(ordersPageBody, 'requirePagePermission("order.view")', "prisma.order.findMany");
  assertBefore(ordersPageBody, 'requirePagePermission("order.view")', "prisma.customer.findMany");
});
test("订单列表不重复认证、不读取会话且无角色硬编码", () => assert.doesNotMatch(ordersPageBody, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i));
test("订单列表保留筛选、排序和详情 Manager", () => {
  assert.match(ordersPageBody, /where\.OR/);
  assert.match(ordersPageBody, /orderBy: \{ createdAt: "desc" \}/);
  assert.match(ordersPageBody, /<OrderManager/);
});
test("订单列表复用 order.view 安全用户", () => assert.match(ordersPageBody, /const user = await requirePagePermission\("order\.view"\)/));
test("订单列表导入纯权限判断函数", () => assert.match(source.orders, /import \{ hasPermission \} from "@\/lib\/permissions"/));
test("订单列表计算三个独立写权限 Boolean 和空覆盖", () => {
  for (const [name, permission] of [["canCreateOrder", "create"], ["canUpdateOrder", "update"], ["canDeleteOrder", "delete"]]) {
    assert.match(ordersPageBody, new RegExp(`const ${name} = hasPermission\\(user\\.role, "order\\.${permission}", \\[\\]\\)`));
  }
});
test("订单列表只向 Manager 传三个最小写权限 Boolean", () => {
  const managerProps = sourceSlice(ordersPageBody, "<OrderManager", "/>" );
  for (const prop of ["canCreateOrder", "canUpdateOrder", "canDeleteOrder"]) assert.match(managerProps, new RegExp(`${prop}=\\{${prop}\\}`));
  assert.doesNotMatch(managerProps, /role=|permissions?=|user=|overrides=/i);
});
test("订单列表未接入导入或跨模块写权限", () => assert.doesNotMatch(ordersPageBody, /order\.importProducts|product\.|part\.|drawing\./));
test("OrderManager 声明三个最小写权限 Boolean", () => {
  for (const prop of ["canCreateOrder", "canUpdateOrder", "canDeleteOrder"]) assert.match(source.orderListManager, new RegExp(`${prop}: boolean`));
  assert.doesNotMatch(source.orderListManager, /\brole\s*:|permissions?\s*:/i);
});
test("订单共享表单分别使用创建和编辑权限", () => assert.match(source.orderListManager, /\(isEditing \? canUpdateOrder : canCreateOrder\) \? \(\s*<section/));
test("订单编辑按钮由 canUpdateOrder 条件渲染", () => assert.match(source.orderListManager, /\{canUpdateOrder \? \([\s\S]*?编辑[\s\S]*?\) : null\}/));
test("订单删除按钮由 canDeleteOrder 条件渲染", () => assert.match(source.orderListManager, /\{canDeleteOrder \? \([\s\S]*?删除[\s\S]*?\) : null\}/));
test("订单列表三个写处理函数均有防御性权限检查", () => {
  assert.match(functionBody(source.orderListManager, "function startEdit"), /if \(!canUpdateOrder\) return/);
  assert.match(functionBody(source.orderListManager, "async function submitForm"), /\(isEditing && !canUpdateOrder\) \|\| \(!isEditing && !canCreateOrder\)/);
  assert.match(functionBody(source.orderListManager, "async function deleteOrder"), /if \(!canDeleteOrder\) return/);
});
test("订单列表写权限不使用 disabled 或 CSS 隐藏替代 DOM 过滤", () => {
  assert.doesNotMatch(source.orderListManager, /disabled=\{!?can(?:Create|Update|Delete)Order\}/);
  assert.doesNotMatch(source.orderListManager, /(?:hidden|invisible)[\s\S]{0,120}can(?:Create|Update|Delete)Order|can(?:Create|Update|Delete)Order[\s\S]{0,120}(?:hidden|invisible)/);
});
test("OrderManager 不读取用户、权限 API、Cookie 或 Session", () => assert.doesNotMatch(source.orderListManager, /hasPermission|requirePage|\/api\/auth\/me|cookies\(|document\.cookie|session|\brole\b/i));
test("订单列表原搜索详情和写请求保持", () => {
  assert.match(source.orderListManager, /new URLSearchParams/);
  assert.match(source.orderListManager, /href=\{`\/orders\/\$\{order\.id\}`\}/);
  assert.match(source.orderListManager, /method: isEditing \? "PUT" : "POST"/);
  assert.match(source.orderListManager, /fetch\(`\/api\/orders\/\$\{order\.id\}`, \{ method: "DELETE" \}\)/);
});
test("订单列表状态筛选和只读状态显示继续保留", () => {
  const filterForm = sourceSlice(source.orderListManager, '<form className="mt-4 rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm" onSubmit={submitFilters}>', "</form>");
  assert.match(filterForm, /filterForm\.status/);
  assert.match(filterForm, /orderStatusOptions\.map/);
  assert.match(source.orderListManager, /getOrderStatusLabel\(order\.status\)/);
});
test("订单列表新增编辑共用表单不再包含状态控件", () => {
  const orderForm = sourceSlice(source.orderListManager, '<form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={submitForm}>', "</form>");
  assert.doesNotMatch(orderForm, /订单状态|form\.status|updateField\("status"/);
});
test("订单列表编辑 state 和初始化不再包含 status", () => {
  const orderFormType = sourceSlice(source.orderListManager, "type OrderForm = {", "};");
  const emptyForm = functionBody(source.orderListManager, "function emptyForm");
  const startEdit = functionBody(source.orderListManager, "function startEdit");
  for (const section of [orderFormType, emptyForm, startEdit]) assert.doesNotMatch(section, /\bstatus\b/);
});
test("订单列表 PUT 请求体不再提交 status", () => {
  const submitForm = functionBody(source.orderListManager, "async function submitForm");
  assert.match(submitForm, /method: isEditing \? "PUT" : "POST"/);
  assert.match(submitForm, /body: JSON\.stringify\(form\)/);
  assert.doesNotMatch(submitForm, /form\.status|\bstatus\s*:/);
});

test("外发列表导入页面权限助手", () => assert.match(source.outsourcing, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/));
test("外发列表只要求一次 outsource.view", () => assert.equal(occurrenceCount(outsourcingPageBody, 'requirePagePermission("outsource.view")'), 1));
test("外发列表鉴权早于参数和 Prisma 查询", () => {
  assertBefore(outsourcingPageBody, 'requirePagePermission("outsource.view")', "await searchParams");
  assertBefore(outsourcingPageBody, 'requirePagePermission("outsource.view")', "prisma.outsourceOrder.findMany");
});
test("外发列表不重复认证、不读取会话且无角色硬编码", () => assert.doesNotMatch(outsourcingPageBody, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i));
test("外发列表保留原筛选、排序和列表 Manager", () => {
  assert.match(outsourcingPageBody, /andConditions\.push/);
  assert.match(outsourcingPageBody, /orderBy: \{ createdAt: "desc" \}/);
  assert.match(outsourcingPageBody, /<OutsourcingManager/);
});
test("外发列表基础查看门禁未升级为完整创建门禁", () => {
  assert.equal(occurrenceCount(outsourcingPageBody, 'requirePagePermission("outsource.view")'), 1);
  assert.doesNotMatch(outsourcingPageBody, /requirePageAllPermissions/);
});

test("送货列表导入页面权限助手", () => assert.match(source.delivery, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/));
test("送货列表只要求一次 delivery.view", () => assert.equal(occurrenceCount(deliveryPageBody, 'requirePagePermission("delivery.view")'), 1));
test("送货列表鉴权早于参数和 Prisma 查询", () => {
  assertBefore(deliveryPageBody, 'requirePagePermission("delivery.view")', "await searchParams");
  assertBefore(deliveryPageBody, 'requirePagePermission("delivery.view")', "prisma.deliveryOrder.findMany");
});
test("送货列表不重复认证、不读取会话且无角色硬编码", () => assert.doesNotMatch(deliveryPageBody, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i));
test("送货列表保留筛选、排序和详情链接", () => {
  assert.match(deliveryPageBody, /andConditions\.push/);
  assert.match(deliveryPageBody, /orderBy: \{ createdAt: "desc" \}/);
  assert.match(deliveryPageBody, /href=\{`\/delivery\/\$\{deliveryOrder\.id\}`\}/);
});
test("送货列表未提前接入创建或写权限", () => assert.doesNotMatch(deliveryPageBody, /delivery\.(?:create|update|delete)/));

test("齐套页面导入页面权限助手", () => assert.match(source.kitting, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/));
test("齐套页面只要求一次 kitting.view", () => assert.equal(occurrenceCount(kittingPageBody, 'requirePagePermission("kitting.view")'), 1));
test("齐套页面鉴权早于 searchParams", () => assertBefore(kittingPageBody, 'requirePagePermission("kitting.view")', "await searchParams"));
test("齐套页面鉴权早于 Prisma 查询", () => assertBefore(kittingPageBody, 'requirePagePermission("kitting.view")', "prisma.product.findMany"));
test("齐套页面鉴权早于齐套计算", () => assertBefore(kittingPageBody, 'requirePagePermission("kitting.view")', "calculateKittingResult"));
test("齐套页面不重复认证、不读取会话且无角色硬编码", () => assert.doesNotMatch(kittingPageBody, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i));
test("齐套页面保留原产品订单部件查询和数据转换", () => {
  assert.match(kittingPageBody, /prisma\.product\.findMany/);
  assert.match(kittingPageBody, /orderBy: \{ createdAt: "desc" \}/);
  assert.match(kittingPageBody, /const kittingProducts = products\.map/);
});
test("齐套执行入口保持且页面接入 kitting.execute", () => {
  assert.match(source.kittingManager, /fetch\(`\/api\/kitting\/\$\{product\.id\}`, \{ method: "POST" \}\)/);
  assert.match(kittingPageBody, /kitting\.execute/);
});

test("生产推进 Boolean 精确使用五项权限和空覆盖", () => {
  const block = sourceSlice(source.production, "const canUpdateProductionProgress =", "const canReportProductionAbnormal =");
  for (const permission of ["order.view", "product.view", "part.view", "production.view", "production.updateProgress"]) {
    assert.equal(occurrenceCount(block, `hasPermission(user.role, "${permission}", [])`), 1);
  }
});
test("生产异常登记 Boolean 精确使用五项权限和空覆盖", () => {
  const block = sourceSlice(source.production, "const canReportProductionAbnormal =", "\n  const canCreateOutsourceOrder");
  for (const permission of ["order.view", "product.view", "part.view", "production.view", "production.reportAbnormal"]) {
    assert.equal(occurrenceCount(block, `hasPermission(user.role, "${permission}", [])`), 1);
  }
});
test("生产页面独立传递两个最小写权限 Boolean", () => {
  const manager = sourceSlice(source.production, "<ProductionManager", "/>");
  assert.match(manager, /canUpdateProductionProgress=\{canUpdateProductionProgress\}/);
  assert.match(manager, /canReportProductionAbnormal=\{canReportProductionAbnormal\}/);
  assert.doesNotMatch(manager, /\b(?:user|role|permissions|overrides)=/);
});
test("生产 Client 声明两个独立写权限 Boolean", () => {
  assert.match(source.productionManager, /canUpdateProductionProgress: boolean/);
  assert.match(source.productionManager, /canReportProductionAbnormal: boolean/);
  assert.doesNotMatch(source.productionManager, /canManageProduction/);
});
test("推进按钮由 canUpdateProductionProgress 进行 DOM 裁剪", () => {
  assert.match(source.productionManager, /\{canUpdateProductionProgress \? \([\s\S]*?advancePart\(part\)[\s\S]*?\) : null\}/);
  assert.doesNotMatch(source.productionManager, /disabled=\{!?canUpdateProductionProgress\}/);
});
test("推进处理函数在设置状态和 fetch 前防御权限", () => {
  const body = functionBody(source.productionManager, "async function advancePart");
  assertBefore(body, "if (!canUpdateProductionProgress) return", 'setMessage("")');
  assertBefore(body, "if (!canUpdateProductionProgress) return", "fetch(");
});
test("异常登记入口和模态框由独立 Boolean 防御", () => {
  const renderButton = functionBody(source.productionManager, "function renderAbnormalButton");
  const openModal = functionBody(source.productionManager, "function openAbnormalModal");
  assertBefore(renderButton, "if (!canReportProductionAbnormal) return null", "return (");
  assertBefore(openModal, "if (!canReportProductionAbnormal) return", "setAbnormalTarget");
});
test("异常登记提交函数在请求体和 fetch 前防御权限", () => {
  const body = functionBody(source.productionManager, "async function registerAbnormal");
  assertBefore(body, "if (!canReportProductionAbnormal) return", "JSON.stringify");
  assertBefore(body, "if (!canReportProductionAbnormal) return", "fetch(");
});

test("异常处理 Boolean 精确使用五项权限和空覆盖", () => {
  const block = sourceSlice(source.productionAbnormal, "const canResolveProductionAbnormal =", "\n\n  const params");
  for (const permission of ["order.view", "product.view", "part.view", "production.abnormal.view", "production.resolveAbnormal"]) {
    assert.equal(occurrenceCount(block, `hasPermission(user.role, "${permission}", [])`), 1);
  }
});
test("异常页面只向处理组件传最小 Boolean", () => {
  const component = sourceSlice(source.productionAbnormal, "<AbnormalResolveActions", "/>");
  assert.match(component, /canResolveProductionAbnormal=\{canResolveProductionAbnormal\}/);
  assert.doesNotMatch(component, /\b(?:user|role|permissions|overrides)=/);
});
test("无异常处理权限时编辑和确认入口不进入 DOM", () => {
  assert.match(source.abnormalResolveActions, /if \(!canResolveProductionAbnormal\) return null/);
  assert.doesNotMatch(source.abnormalResolveActions, /disabled=\{!?canResolveProductionAbnormal\}/);
});
test("异常处理函数在 JSON 和 fetch 前防御权限", () => {
  const body = functionBody(source.abnormalResolveActions, "async function resolveAbnormal");
  assertBefore(body, "if (!canResolveProductionAbnormal) return", "JSON.stringify");
  assertBefore(body, "if (!canResolveProductionAbnormal) return", "fetch(");
});

test("订单详情生产完成 Boolean 精确使用五项权限和空覆盖", () => {
  const block = sourceSlice(source.orderDetail, "const canCompleteProductionProduct =", "\n  const canCreateOutsourceOrder");
  for (const permission of ["order.view", "product.view", "part.view", "production.view", "production.completeProduct"]) {
    assert.equal(occurrenceCount(block, `hasPermission(user.role, "${permission}", [])`), 1);
  }
});
test("订单详情只新增并传递生产完成最小 Boolean", () => {
  assert.match(source.orderDetail, /canCompleteProductionProduct=\{canCompleteProductionProduct\}/);
  assert.match(source.orderManager, /canCompleteProductionProduct: boolean/);
  assert.doesNotMatch(source.orderDetail, /canUpdateProductionProgress|canReportProductionAbnormal|canExecuteKitting/);
});
test("订单详情既有写权限 Boolean 全部保持", () => {
  for (const name of ["canUpdateOrder", "canCreateProduct", "canUpdateProduct", "canDeleteProduct", "canCreatePart", "canUpdatePart", "canDeletePart", "canUploadDrawing", "canUpdateDrawing", "canSetMainDrawing", "canObsoleteDrawing"]) {
    assert.match(source.orderDetail, new RegExp(`${name}=\\{${name}\\}`));
  }
});
test("生产完成按钮由独立 Boolean 进行 DOM 裁剪", () => {
  assert.match(source.orderManager, /\{canCompleteProductionProduct \? \([\s\S]*?markProductionComplete\(product\)[\s\S]*?\) : null\}/);
  assert.doesNotMatch(source.orderManager, /disabled=\{!?canCompleteProductionProduct\}/);
});
test("生产完成处理函数在确认框前防御权限", () => {
  const body = functionBody(source.orderManager, "async function markProductionComplete");
  assertBefore(body, "if (!canCompleteProductionProduct) return", "window.confirm");
});

test("齐套执行 Boolean 精确使用五项权限和空覆盖", () => {
  const block = sourceSlice(source.kitting, "const canExecuteKitting =", "\n\n  const { productId }");
  for (const permission of ["order.view", "product.view", "part.view", "kitting.view", "kitting.execute"]) {
    assert.equal(occurrenceCount(block, `hasPermission(user.role, "${permission}", [])`), 1);
  }
});
test("齐套页面只向 Client 传执行 Boolean", () => {
  const manager = sourceSlice(source.kitting, "<KittingManager", "/>");
  assert.match(manager, /canExecuteKitting=\{canExecuteKitting\}/);
  assert.doesNotMatch(manager, /\b(?:user|role|permissions|overrides)=/);
});
test("齐套执行按钮由 canExecuteKitting 进行 DOM 裁剪", () => {
  assert.match(source.kittingManager, /\{canExecuteKitting \? \([\s\S]*?checkProduct\(product\)[\s\S]*?\) : null\}/);
  assert.doesNotMatch(source.kittingManager, /disabled=\{!?canExecuteKitting\}/);
});
test("齐套处理函数在加载状态和 fetch 前防御权限", () => {
  const body = functionBody(source.kittingManager, "async function checkProduct");
  assertBefore(body, "if (!canExecuteKitting) return", 'setMessage("")');
  assertBefore(body, "if (!canExecuteKitting) return", "fetch(");
});
test("五个 C3e-1 Client 不读取角色或完整权限", () => {
  for (const key of ["productionManager", "abnormalResolveActions", "orderManager", "kittingManager"]) {
    assert.doesNotMatch(source[key], /hasPermission|permissions\s*:|role\s*(?:===|!==)|cookies\(|document\.cookie|session/i);
  }
});
test("五个 C3e-1 权限入口不使用 CSS 隐藏", () => {
  for (const [key, permissionName] of [
    ["productionManager", "canUpdateProductionProgress"],
    ["productionManager", "canReportProductionAbnormal"],
    ["abnormalResolveActions", "canResolveProductionAbnormal"],
    ["orderManager", "canCompleteProductionProduct"],
    ["kittingManager", "canExecuteKitting"]
  ]) {
    assert.doesNotMatch(source[key], new RegExp(`(?:hidden|invisible)[\\s\\S]{0,160}${permissionName}|${permissionName}[\\s\\S]{0,160}(?:hidden|invisible)`));
  }
});

test("全局导入页面导入页面权限助手", () => assert.match(source.excelImport, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/));
test("全局导入页面只要求一次 import.view", () => assert.equal(occurrenceCount(excelImportPageBody, 'requirePagePermission("import.view")'), 1));
test("全局导入页面鉴权早于 Manager 渲染", () => assertBefore(excelImportPageBody, 'requirePagePermission("import.view")', "return <ImportExcelManager"));
test("全局导入页面不重复认证、不读取会话且无角色硬编码", () => assert.doesNotMatch(excelImportPageBody, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i));
test("全局导入保留标准与简化模板链接", () => {
  assert.match(source.excelImportManager, /"\/api\/imports\/excel\/template"/);
  assert.match(source.excelImportManager, /"\/api\/imports\/excel\/simple-template"/);
});
test("全局导入保留预览与确认调用", () => {
  assert.match(source.excelImportManager, /fetch\(previewUrl/);
  assert.match(source.excelImportManager, /fetch\(confirmUrl/);
});
test("全局导入页面未提前接入 preview 或 execute 权限", () => assert.doesNotMatch(excelImportPageBody, /import\.(?:preview|execute)/));

test("客户管理菜单绑定 customer.view", () => assert.equal(menuEntry("客户管理"), "customer.view"));
test("订单管理菜单绑定 order.view", () => assert.equal(menuEntry("订单管理"), "order.view"));
test("生产进度菜单绑定 production.view", () => assert.equal(menuEntry("生产进度"), "production.view"));
test("齐套检查菜单绑定 kitting.view", () => assert.equal(menuEntry("齐套检查"), "kitting.view"));
test("外发电镀菜单绑定 outsource.view", () => assert.equal(menuEntry("外发电镀"), "outsource.view"));
test("生产日报菜单绑定 production.daily.view", () => assert.equal(menuEntry("生产日报"), "production.daily.view"));
test("生产异常菜单绑定 production.abnormal.view", () => assert.equal(menuEntry("生产异常"), "production.abnormal.view"));
test("Excel 导入菜单绑定 import.view", () => assert.equal(menuEntry("Excel 导入"), "import.view"));
test("九项 C2d-3b 新导航权限均为合法权限", () => {
  for (const permission of ["customer.view", "order.view", "production.view", "kitting.view", "outsource.view", "delivery.view", "production.daily.view", "production.abnormal.view", "import.view"]) assert.equal(isPermission(permission), true);
});

test("六项既有导航绑定保持不变", () => {
  assert.equal(menuEntry("首页看板"), "dashboard.view");
  assert.equal(menuEntry("产品管理"), "product.view");
  assert.equal(menuEntry("部件管理"), "part.view");
  assert.equal(menuEntry("图纸管理"), "drawing.view");
  assert.equal(menuEntry("回厂登记"), "return.view");
  assert.equal(menuEntry("数据管理"), "dataManagement.view");
});
test("导航继续集中使用 hasPermission 且没有角色硬编码", () => {
  assert.match(source.layout, /hasPermission\(role, item\.permission, \[\]\)/);
  assert.doesNotMatch(source.layout, /role\s*(?:===|!==)/);
});
test("C2d-3b 保持 API allowlist 精确为十四条 route", async () => {
  const self = await readFile(fileURLToPath(import.meta.url), "utf8");
  const match = /const permittedRoutes = new Set\(\[([\s\S]*?)\]\);/.exec(self);
  assert.ok(match, "未找到 API allowlist");
  assert.equal([...match[1].matchAll(/"[^"\n]+\/route\.ts"/g)].length, 14);
});
test("备份 Server 页面不再是 Client Component", () => assert.doesNotMatch(source.backupPage, /^"use client";/m));
test("备份页面导入统一页面权限助手与 Client Manager", () => {
  assert.match(source.backupPage, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/);
  assert.match(source.backupPage, /import BackupManager from "\.\/backup-manager"/);
});
test("备份页面为 async Server Component", () => assert.match(source.backupPage, /export default async function BackupPage\(\)/));
test("备份页面只要求一次 backup.view", () => assert.equal(occurrenceCount(backupPageBody, 'requirePagePermission("backup.view")'), 1));
test("备份页面鉴权早于 BackupManager 渲染", () => assertBefore(backupPageBody, 'requirePagePermission("backup.view")', "return <BackupManager"));
test("备份页面不重复认证、不读取会话且无角色硬编码", () => assert.doesNotMatch(backupPageBody, /requirePageUser|next\/headers|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i));
test("备份页面不直接读取目录或调用备份接口", () => assert.doesNotMatch(backupPageBody, /fetch\(|node:fs|readdir|backupTarget|uploadsPath/));
test("备份 Client Manager 保持 use client", () => assert.match(source.backupManager, /^"use client";/m));
test("备份 Client Manager 保留列表 GET", () => assert.match(source.backupManager, /fetch\("\/api\/system\/backup\/list"\)/));
test("备份 Client Manager 保留创建备份 POST", () => assert.match(source.backupManager, /fetch\("\/api\/system\/backup", \{\s*method: "POST"\s*\}\)/));
test("备份 Client Manager 保留首次加载、刷新与创建后刷新", () => {
  assert.match(source.backupManager, /useEffect\(\(\) => \{\s*void loadBackupRecords\(\);/);
  assert.match(source.backupManager, /onClick=\{\(\) => void loadBackupRecords\(\)\}/);
  assert.match(source.backupManager, /finally \{\s*setIsBackingUp\(false\);\s*void loadBackupRecords\(\);/);
});
test("备份 Client Manager 保留 loading 和错误状态", () => {
  assert.match(source.backupManager, /const \[isLoadingRecords, setIsLoadingRecords\] = useState\(true\)/);
  assert.match(source.backupManager, /const \[recordError, setRecordError\] = useState\(""/);
});
test("备份 Client Manager 保留创建按钮与文案", () => {
  assert.match(source.backupManager, /onClick=\{handleBackup\}/);
  assert.match(source.backupManager, /一键备份/);
});
test("备份 Client Manager 不接入权限或 backup.create", () => assert.doesNotMatch(source.backupManager, /backup\.create|hasPermission|requirePagePermission|cookies\(|document\.cookie|session|role\s*(?:===|!==)/i));
test("系统备份保持原路由且不绑定 backup.create", () => {
  assert.match(source.layout, /href: "\/settings\/backup", label: "系统备份", permission: "backup\.view"/);
  assert.doesNotMatch(source.layout, /label: "系统备份", permission: "backup\.create"/);
});
test("备份列表 GET 继续使用 backup.view", () => assert.match(source.backupListApi, /requireApiPermission\("backup\.view"\)/));
test("备份创建 API 未提前接入 backup.create", () => assert.doesNotMatch(source.backupCreateApi, /backup\.create/));
test("备份页面和 Manager 不使用 CSS 隐藏创建入口", () => assert.doesNotMatch(source.backupManager, /(?:hidden|invisible).*一键备份|一键备份[\s\S]{0,200}(?:hidden|invisible)/));

test("仅已批准的读取 API 引用权限助手", async () => {
  const apiRoot = path.join(root, "src/app/api");
  const permittedRoutes = new Set([
    "drawings/[id]/file/route.ts",
    "drawings/[id]/thumbnail/route.ts",
    "drawings/[id]/print-thumbnail/route.ts",
    "parts/[id]/drawings/route.ts",
    "delivery/route.ts",
    "delivery/[id]/route.ts",
    "outsourcing/route.ts",
    "returns/route.ts",
    "kitting/[productId]/route.ts",
    "products/[id]/parts/route.ts",
    "system/backup/list/route.ts",
    "imports/excel/template/route.ts",
    "imports/excel/simple-template/route.ts",
    "orders/[id]/import-products/template/route.ts"
  ]);
  const protectedWriteRoutes = new Set([
    "customers/route.ts",
    "customers/[id]/route.ts",
    "orders/route.ts",
    "orders/[id]/route.ts",
    "orders/[id]/products/route.ts",
    "products/[id]/route.ts",
    "products/[id]/whole-part/route.ts",
    "parts/[id]/route.ts"
    ,"parts/[id]/drawings/route.ts"
    ,"drawings/[id]/route.ts"
    ,"drawings/[id]/main/route.ts"
    ,"parts/[id]/advance/route.ts"
    ,"parts/[id]/abnormal/route.ts"
    ,"parts/[id]/abnormal/resolve/route.ts"
    ,"products/[id]/mark-production-complete/route.ts"
  ]);
  const { readdir } = await import("node:fs/promises");
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(target);
      if (entry.isFile() && entry.name === "route.ts") {
        const content = await readFile(target, "utf8");
        const relativePath = path.relative(apiRoot, target).replaceAll("\\", "/");
        if (permittedRoutes.has(relativePath) || protectedWriteRoutes.has(relativePath)) assert.match(content, /requireApi(?:Any|All)?Permission/);
        else assert.doesNotMatch(content, /requireApi(?:Any|All)?Permission/);
      }
    }
  }
  await scan(apiRoot);
});

test("订单详情页新增四个最小图纸写权限 Boolean", () => {
  for (const [name, permissions] of [
    ["canUploadDrawing", ["part.view", "drawing.view", "drawing.upload"]],
    ["canUpdateDrawing", ["drawing.view", "drawing.update"]],
    ["canSetMainDrawing", ["drawing.view", "drawing.setMain"]],
    ["canObsoleteDrawing", ["drawing.view", "drawing.obsolete"]]
  ]) {
    const block = sourceSlice(source.orderDetail, `const ${name} =`, ";");
    for (const permission of permissions) assert.match(block, new RegExp(`hasPermission\\(user\\.role, "${permission.replace(".", "\\.")}", \\[\\]\\)`));
  }
});

test("订单详情只向 Client 传递四个图纸 Boolean，不泄露权限上下文", () => {
  for (const name of ["canUploadDrawing", "canUpdateDrawing", "canSetMainDrawing", "canObsoleteDrawing"]) {
    assert.match(source.orderDetail, new RegExp(`${name}=\\{${name}\\}`));
    assert.match(source.orderManager, new RegExp(`${name}: boolean;`));
  }
  assert.doesNotMatch(source.orderDetail, /<(?:OrderDetailManager)[\\s\\S]*?(?:user=|role=|permissions=|overrides=)/);
});

test("订单详情图纸写入口由各自 Boolean 裁剪且处理函数防御性检查", () => {
  assert.match(source.orderManager, /\{canUploadDrawing \? \([\s\S]*?<form className="flex flex-wrap items-center gap-2"/);
  assert.match(source.orderManager, /async function uploadDrawings[\s\S]*?if \(!canUploadDrawing\) return;[\s\S]*?new FormData/);
  assert.match(source.orderManager, /async function updateDrawingStatus[\s\S]*?if \(!canUpdateDrawing\) return;/);
  assert.match(source.orderManager, /\{canUpdateDrawing \? \([\s\S]*?<select/);
  assert.match(source.orderManager, /async function setMainDrawing[\s\S]*?if \(!canSetMainDrawing\) return;/);
  assert.match(source.orderManager, /\{canSetMainDrawing \? \(/);
  assert.match(source.orderManager, /async function obsoleteDrawing[\s\S]*?if \(!canObsoleteDrawing\) return;[\s\S]*?window\.confirm/);
  assert.match(source.orderManager, /\{canObsoleteDrawing \? \(/);
});

test("图纸状态编辑不再提供 OBSOLETE，作废继续独立使用 DELETE", () => {
  assert.match(source.orderManager, /const drawingStatuses = \["PENDING", "CONFIRMED"\]/);
  assert.doesNotMatch(source.orderManager, /const drawingStatuses = \[[^\]]*"OBSOLETE"/);
  assert.match(source.orderManager, /fetch\(`\/api\/drawings\/\$\{drawing\.id\}`, \{ method: "DELETE" \}\)/);
});

test("上传中心在 params 与 Prisma 前完成订单和完整图纸上传门禁", () => {
  assert.match(source.drawingUploadCenter, /import \{ requirePagePermission \} from "@\/lib\/auth\/authorization"/);
  assert.match(source.drawingUploadCenter, /const user = await requirePagePermission\("order\.view"\)/);
  for (const permission of ["part.view", "drawing.view", "drawing.upload"]) {
    assert.match(source.drawingUploadCenter, new RegExp(`hasPermission\\(user\\.role, "${permission.replace(".", "\\.")}", \\[\\]\\)`));
  }
  for (const marker of ["await params", "prisma.order.findFirst", "notFound()"]) assertBefore(source.drawingUploadCenter, "if (!canUploadDrawings) redirect(\"/forbidden\")", marker);
  assert.doesNotMatch(source.drawingUploadCenter, /cookies\(|session|role\s*(?:===|!==)/i);
  assert.doesNotMatch(source.drawingUploadCenterManager, /hasPermission|requirePagePermission|role\s*(?:===|!==)|permissions|overrides/);
});
test("推进请求发送 expectedStatus", () => {
  const body = functionBody(source.productionManager, "async function advancePart");
  assert.match(body, /expectedStatus: part\.status/);
});
test("推进 expectedStatus 直接来自当前渲染 Part", () => {
  assert.match(source.productionManager, /async function advancePart\(part: ProductionPart\)/);
  assert.match(source.productionManager, /status: ProductPartStatus/);
});
test("推进 Client 不计算或发送目标状态", () => {
  const body = functionBody(source.productionManager, "async function advancePart");
  assert.doesNotMatch(body, /nextStatus|targetStatus|toStatus/);
});
test("推进请求保持 POST JSON 结构", () => {
  const body = functionBody(source.productionManager, "async function advancePart");
  assert.match(body, /method: "POST"/);
  assert.match(body, /"Content-Type": "application\/json"/);
  assert.match(body, /body: JSON\.stringify/);
});
test("推进权限防御仍早于 expectedStatus 请求", () => {
  const body = functionBody(source.productionManager, "async function advancePart");
  assertBefore(body, "if (!canUpdateProductionProgress) return", "expectedStatus: part.status");
});
test("异常处理只读显示 fromStatus 中文状态", () => {
  assert.match(source.abnormalResolveActions, /恢复到：\{partStatusLabels\[fromStatus\]\}/);
  assert.match(source.abnormalResolveActions, /fromStatus: ProductPartStatus/);
});
test("异常处理不再提供任意恢复状态 select", () => {
  assert.doesNotMatch(source.abnormalResolveActions, /restoreStatusOptions|setRestoreStatus|<select/);
});
test("异常处理请求不再发送目标状态", () => {
  const body = functionBody(source.abnormalResolveActions, "async function resolveAbnormal");
  assert.doesNotMatch(body, /restoreStatus|targetStatus|status:/);
});
test("异常处理继续发送处理备注", () => {
  const body = functionBody(source.abnormalResolveActions, "async function resolveAbnormal");
  assert.match(body, /resolvedRemark/);
  assert.match(source.abnormalResolveActions, /placeholder="处理备注，可选"/);
});
test("异常处理备注继续限制 500 字", () => {
  assert.match(source.abnormalResolveActions, /resolvedRemark\.trim\(\)\.length > 500/);
  assert.match(source.abnormalResolveActions, /maxLength=\{500\}/);
});
test("异常处理成功仍刷新页面", () => {
  assert.match(source.abnormalResolveActions, /router\.refresh\(\)/);
});
test("五个 C3e-1 Boolean 与权限 DOM 边界保持", () => {
  for (const marker of ["canUpdateProductionProgress", "canReportProductionAbnormal", "canResolveProductionAbnormal", "canCompleteProductionProduct", "canExecuteKitting"]) {
    assert.match(Object.values(source).join("\n"), new RegExp(marker));
  }
});
test("齐套和订单详情 Client 权限行为未被 C3e-2 改写", () => {
  assert.match(source.kittingManager, /if \(!canExecuteKitting\) return/);
  assert.match(source.orderManager, /if \(!canCompleteProductionProduct\) return/);
  assert.match(source.kittingManager, /fetch\(`\/api\/kitting\/\$\{product\.id\}`/);
});

const outsourceCreateBooleanPattern =
  /const canCreateOutsourceOrder =\s+hasPermission\(user\.role, "order\.view", \[\]\) &&\s+hasPermission\(user\.role, "product\.view", \[\]\) &&\s+hasPermission\(user\.role, "part\.view", \[\]\) &&\s+hasPermission\(user\.role, "drawing\.view", \[\]\) &&\s+hasPermission\(user\.role, "outsource\.view", \[\]\) &&\s+hasPermission\(user\.role, "outsource\.create", \[\]\)/;

test("外发列表继续只以 outsource.view 作为页面查看门禁", () => {
  assert.equal(occurrenceCount(source.outsourcing, 'requirePagePermission("outsource.view")'), 1);
  assertBefore(source.outsourcing, 'requirePagePermission("outsource.view")', "await searchParams");
  assertBefore(source.outsourcing, 'requirePagePermission("outsource.view")', "prisma.outsourceOrder.findMany");
});
test("外发列表创建 Boolean 精确使用六项权限和空覆盖", () => {
  assert.match(source.outsourcing, outsourceCreateBooleanPattern);
});
test("外发列表创建入口由 Boolean 进行 DOM 裁剪", () => {
  assert.match(source.outsourcing, /canCreateOutsourceOrder=\{canCreateOutsourceOrder\}/);
  assert.match(source.outsourcingManager, /\{canCreateOutsourceOrder \? \(\s+<Link[\s\S]*?href="\/outsourcing\/new"[\s\S]*?\) : null\}/);
  assert.doesNotMatch(source.outsourcingManager, /disabled=\{!?canCreateOutsourceOrder\}|(?:hidden|invisible)[\s\S]{0,160}canCreateOutsourceOrder/);
});
test("外发列表查看详情和筛选不依赖创建权限", () => {
  assert.match(source.outsourcingManager, /href=\{`\/outsourcing\/\$\{order\.id\}`\}/);
  assert.match(source.outsourcingManager, /onSubmit=\{submitFilters\}/);
  assert.doesNotMatch(source.outsourcing, /requirePageAllPermissions/);
});
test("外发新建页创建 Boolean 精确使用六项权限和空覆盖", () => {
  assert.match(source.outsourceNew, outsourceCreateBooleanPattern);
});
test("外发新建页完整权限检查早于所有敏感 Prisma 查询", () => {
  assertBefore(source.outsourceNew, 'requirePagePermission("outsource.view")', "const canCreateOutsourceOrder");
  assertBefore(source.outsourceNew, "if (!canCreateOutsourceOrder)", "prisma.order.findMany");
  assertBefore(source.outsourceNew, "if (!canCreateOutsourceOrder)", "prisma.outsourceOrder.findMany");
});
test("外发新建页无创建权限时不实例化表单 Client", () => {
  assertBefore(source.outsourceNew, "if (!canCreateOutsourceOrder)", "<OutsourceCreateManager");
  assert.match(source.outsourceNew, /没有创建外发单的权限。/);
});
test("外发新建页只向 Client 传创建 Boolean 而不传安全用户", () => {
  const managerProps = sourceSlice(source.outsourceNew, "<OutsourceCreateManager", "/>");
  assert.match(managerProps, /canCreateOutsourceOrder=\{canCreateOutsourceOrder\}/);
  assert.doesNotMatch(managerProps, /\b(?:user|role|permissions?|overrides)=/i);
});
test("外发创建 Client 只声明最小创建权限 Boolean", () => {
  assert.match(source.outsourceCreateManager, /canCreateOutsourceOrder: boolean/);
  assert.doesNotMatch(source.outsourceCreateManager, /\b(?:user|role|permissions?|overrides)\s*:/i);
});
test("外发创建 Client 在状态更新、请求体和 fetch 前防御权限", () => {
  const body = functionBody(source.outsourceCreateManager, "async function submitForm");
  assertBefore(body, "if (!canCreateOutsourceOrder)", 'setMessage("")');
  assertBefore(body, "if (!canCreateOutsourceOrder)", "JSON.stringify");
  assertBefore(body, "if (!canCreateOutsourceOrder)", 'fetch("/api/outsourcing"');
});
test("外发创建 Client 提交入口由 Boolean 裁剪且 disabled 仅绑定处理中", () => {
  assert.match(source.outsourceCreateManager, /\{canCreateOutsourceOrder \? \(\s+<div[\s\S]*?保存外发单[\s\S]*?\) : null\}/);
  assert.match(source.outsourceCreateManager, /disabled=\{isPending\}/);
  assert.doesNotMatch(source.outsourceCreateManager, /disabled=\{!?canCreateOutsourceOrder\}/);
});
test("首页创建 Boolean 精确使用六项权限并替换旧两项逻辑", () => {
  assert.match(source.dashboard, outsourceCreateBooleanPattern);
  assert.match(source.dashboard, /\.\.\.\(canCreateOutsourceOrder \? \[\{ label: "新建外发单", href: "\/outsourcing\/new" \}\] : \[\]\)/);
  assert.doesNotMatch(source.dashboard, /const canCreateOutsource = canViewOutsource/);
});
test("首页外发创建权限不改变看板查询数量与基础门禁", () => {
  assert.equal((source.dashboard.match(/prisma\./g) ?? []).length, 26);
  assert.equal(occurrenceCount(source.dashboard, 'requirePagePermission("dashboard.view")'), 1);
});
test("生产页创建 Boolean 精确使用六项权限并传给 Client", () => {
  assert.match(source.production, outsourceCreateBooleanPattern);
  assert.match(source.production, /canCreateOutsourceOrder=\{canCreateOutsourceOrder\}/);
});
test("生产待外发入口按创建 Boolean 独立裁剪", () => {
  assert.match(source.productionManager, /part\.status === "WAIT_OUTSOURCE"\s+\? canCreateOutsourceOrder\s+: canCreateOutsourceReturn/);
  assert.match(source.productionManager, /\{canRenderLinkAction \? \(\s+<Link[\s\S]*?href=\{linkAction\.href\}/);
  for (const marker of ["canUpdateProductionProgress", "canReportProductionAbnormal"]) assert.match(source.productionManager, new RegExp(marker));
});
test("订单详情创建 Boolean 精确使用六项权限并传给 Client", () => {
  assert.match(source.orderDetail, outsourceCreateBooleanPattern);
  assert.match(source.orderDetail, /canCreateOutsourceOrder=\{canCreateOutsourceOrder\}/);
});
test("订单详情外发入口按创建 Boolean 裁剪且原 Boolean 保持", () => {
  assert.match(source.orderManager, /\{canCreateOutsourceOrder \? \(\s+<Link[\s\S]*?href="\/outsourcing\/new"[\s\S]*?\) : null\}/);
  for (const marker of ["canUpdateOrder", "canCreateProduct", "canCreatePart", "canViewDrawings", "canCompleteProductionProduct"]) {
    assert.match(source.orderDetail, new RegExp(marker));
  }
});
test("四个直达外发创建入口全部使用统一 Boolean", () => {
  for (const content of [source.outsourcingManager, source.dashboard, source.productionManager, source.orderManager]) {
    assert.match(content, /canCreateOutsourceOrder/);
  }
});

const outsourceReturnCreateBooleanPattern =
  /const canCreateOutsourceReturn =\s+hasPermission\(user\.role, "order\.view", \[\]\) &&\s+hasPermission\(user\.role, "product\.view", \[\]\) &&\s+hasPermission\(user\.role, "part\.view", \[\]\) &&\s+hasPermission\(user\.role, "drawing\.view", \[\]\) &&\s+hasPermission\(user\.role, "outsource\.view", \[\]\) &&\s+hasPermission\(user\.role, "return\.view", \[\]\) &&\s+hasPermission\(user\.role, "return\.create", \[\]\)/;

test("回厂列表继续只以 return.view 作为基础查看门禁", () => {
  assert.equal(occurrenceCount(source.returns, 'requirePagePermission("return.view")'), 1);
  assertBefore(source.returns, 'requirePagePermission("return.view")', "await searchParams");
  assertBefore(source.returns, 'requirePagePermission("return.view")', "prisma.outsourceReturn.findMany");
});
test("回厂列表创建 Boolean 精确使用七项权限和空覆盖", () => {
  assert.match(source.returns, outsourceReturnCreateBooleanPattern);
});
test("回厂列表创建意图入口由 Boolean 进行 DOM 裁剪", () => {
  assert.match(source.returns, /\{canCreateOutsourceReturn \? \(\s+<Link[\s\S]*?选择外发单登记[\s\S]*?\) : null\}/);
  assert.doesNotMatch(source.returns, /disabled=\{!?canCreateOutsourceReturn\}|(?:hidden|invisible)[\s\S]{0,160}canCreateOutsourceReturn/);
});
test("回厂新建页权限判断早于 searchParams 和 Prisma", () => {
  assert.match(source.returnNew, outsourceReturnCreateBooleanPattern);
  assertBefore(source.returnNew, 'requirePagePermission("return.view")', "const canCreateOutsourceReturn");
  assertBefore(source.returnNew, "if (!canCreateOutsourceReturn)", "await searchParams");
  assertBefore(source.returnNew, "if (!canCreateOutsourceReturn)", "prisma.outsourceOrder.findUnique");
});
test("回厂新建页无权限时不实例化创建 Client", () => {
  assertBefore(source.returnNew, "if (!canCreateOutsourceReturn)", "<ReturnCreateManager");
  assert.match(source.returnNew, /没有登记回厂的权限。/);
});
test("回厂新建页只向 Client 传最小 Boolean", () => {
  const managerProps = sourceSlice(source.returnNew, "<ReturnCreateManager", "/>");
  assert.match(managerProps, /canCreateOutsourceReturn=\{canCreateOutsourceReturn\}/);
  assert.doesNotMatch(managerProps, /\b(?:user|role|permissions?|overrides)=/i);
});
test("回厂创建 Client 只声明创建 Boolean", () => {
  assert.match(source.returnCreateManager, /canCreateOutsourceReturn: boolean/);
  assert.doesNotMatch(source.returnCreateManager, /\b(?:user|role|permissions?|overrides)\s*:/i);
});
test("回厂创建 Client 在状态更新、请求体和 fetch 前检查权限", () => {
  const body = functionBody(source.returnCreateManager, "async function submitForm");
  assertBefore(body, "if (!canCreateOutsourceReturn) return", 'setMessage("")');
  assertBefore(body, "if (!canCreateOutsourceReturn) return", "JSON.stringify");
  assertBefore(body, "if (!canCreateOutsourceReturn) return", 'fetch("/api/returns",');
});
test("回厂创建 Client 提交按钮由 Boolean 裁剪并使用真实防重复提交状态", () => {
  assert.match(source.returnCreateManager, /\{canCreateOutsourceReturn \? \(\s+<button[\s\S]*?保存回厂记录[\s\S]*?\) : null\}/);
  assert.match(source.returnCreateManager, /disabled=\{isSubmitting \|\| isPending\}/);
  const body = functionBody(source.returnCreateManager, "async function submitForm");
  assertBefore(body, "if (isSubmitting || submittingRef.current) return", "setIsSubmitting(true)");
  assertBefore(body, "setIsSubmitting(true)", 'fetch("/api/returns",');
  assert.match(body, /finally \{[\s\S]*?setIsSubmitting\(false\)/);
  assert.doesNotMatch(source.returnCreateManager, /disabled=\{!?canCreateOutsourceReturn\}/);
});
test("外发详情回厂入口使用统一 Boolean 裁剪", () => {
  assert.match(source.outsourceDetail, outsourceReturnCreateBooleanPattern);
  assert.match(source.outsourceDetail, /\{canCreateOutsourceReturn \? \(\s+<Link[\s\S]*?\/returns\/new\?outsourceOrderId=[\s\S]*?登记回厂[\s\S]*?\) : null\}/);
  assert.equal(occurrenceCount(source.outsourceDetail, 'requirePagePermission("outsource.view")'), 1);
});
test("首页回厂入口使用统一 Boolean 且移除旧名称", () => {
  assert.match(source.dashboard, outsourceReturnCreateBooleanPattern);
  assert.match(source.dashboard, /\.\.\.\(canCreateOutsourceReturn \? \[\{ label: "回厂登记", href: "\/returns" \}\] : \[\]\)/);
  assert.doesNotMatch(source.dashboard, /canCreateReturns/);
});
test("生产页传递统一回厂 Boolean 且 Client 独立裁剪回厂入口", () => {
  assert.match(source.production, outsourceReturnCreateBooleanPattern);
  assert.match(source.production, /canCreateOutsourceReturn=\{canCreateOutsourceReturn\}/);
  assert.match(source.productionManager, /canCreateOutsourceReturn: boolean/);
  assert.match(source.productionManager, /part\.status === "WAIT_OUTSOURCE"\s+\? canCreateOutsourceOrder\s+: canCreateOutsourceReturn/);
});
test("页面回厂权限比 API 多 drawing.view 以保护图纸快照", () => {
  assert.match(source.returnNew, /hasPermission\(user\.role, "drawing\.view", \[\]\)/);
  assert.match(source.returnNew, /withProtectedOutsourceDrawingUrls/);
});
test("四类回厂创建意图入口统一使用 canCreateOutsourceReturn", () => {
  for (const content of [source.returns, source.outsourceDetail, source.dashboard, source.productionManager]) {
    assert.match(content, /canCreateOutsourceReturn/);
  }
});
test("C3g-1 页面改动未提前实现并发或稳定错误", () => {
  for (const content of [source.returns, source.returnNew, source.returnCreateManager, source.outsourceDetail, source.production, source.productionManager]) {
    assert.doesNotMatch(content, /P2002|P2003|P2025|P1008|P2034|SQLITE_BUSY|database is locked|returns-integrity/i);
  }
});
test("C3f-1 页面改动未引入跨模块权限或 C3f-2 业务逻辑", () => {
  for (const content of [source.outsourcing, source.outsourcingManager, source.outsourceNew, source.outsourceCreateManager]) {
    assert.doesNotMatch(content, /outsource\.update|return\.create|P2002|P1008|P2034|SQLITE_BUSY|database is locked/i);
  }
});
test("静态测试仅执行只读文件检查", async () => {
  const self = await readFile(fileURLToPath(import.meta.url), "utf8");
  const forbiddenCalls = ["write", "append"].map((prefix) => new RegExp(`${prefix}File\\s*\\(`));
  forbiddenCalls.push(new RegExp(`un${"link"}\\s*\\(`), new RegExp(`m${"kdir"}\\s*\\(`), new RegExp(`r${"m"}\\s*\\(`));
  for (const pattern of forbiddenCalls) assert.doesNotMatch(self, pattern);
  assert.doesNotMatch(self, new RegExp(`Prisma${"Client"}|@/lib/${"prisma"}`));
});
