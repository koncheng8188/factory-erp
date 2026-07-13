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
  orderDetail: "src/app/(protected)/orders/[id]/page.tsx",
  orderManager: "src/app/(protected)/orders/[id]/order-detail-manager.tsx",
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
test("送货管理菜单继续不绑定权限", () => assert.equal(menuEntry("送货管理"), undefined));
test("布局使用 hasPermission 和空覆盖", () => assert.match(source.layout, /hasPermission\(role, item\.permission, \[\]\)/));
test("布局没有角色硬编码", () => assert.doesNotMatch(source.layout, /role\s*(?:===|!==)/));
test("未接入菜单没有提前绑定权限", () => {
  for (const label of ["客户管理", "订单管理", "生产进度", "齐套检查", "外发电镀", "送货管理", "生产日报", "生产异常", "Excel 导入", "系统备份"]) {
    assert.equal(menuEntry(label), undefined, `${label} 不应提前绑定权限`);
  }
});
test("forbidden 页面不调用业务权限助手", () => assert.doesNotMatch(source.forbidden, /requirePage(?:Any|All)?Permission/));
test("导航绑定的权限键全部合法", () => {
  const bound = [...source.layout.matchAll(/permission: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(bound, ["dashboard.view", "product.view", "part.view", "drawing.view", "return.view", "dataManagement.view"]);
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
test("回厂和送货列表未提前接入创建或打印权限", () => {
  assert.doesNotMatch(source.returns, /return\.(?:create|print)/);
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
test("新建外发单同时要求外发查看和创建权限", () => assert.match(source.dashboard, /const canCreateOutsource = canViewOutsource && hasPermission\(user\.role, "outsource\.create", \[\]\)/));
test("回厂登记同时要求回厂查看和创建权限", () => assert.match(source.dashboard, /const canCreateReturns = canViewReturns && hasPermission\(user\.role, "return\.create", \[\]\)/));
test("新建送货单同时要求送货查看和创建权限", () => assert.match(source.dashboard, /const canCreateDeliveryAction = canViewDeliverySummary && canCreateDelivery/));
test("系统备份要求 backup.view", () => assert.match(source.dashboard, /const canViewBackup = hasPermission\(user\.role, "backup\.view", \[\]\)/));
test("生产日报同时要求查看和打印权限", () => assert.match(source.dashboard, /const canPrintProductionDaily = hasPermission\(user\.role, "production\.daily\.view", \[\]\)\s+&& hasPermission\(user\.role, "production\.daily\.print", \[\]\)/));
test("生产异常清单同时要求查看和打印权限", () => assert.match(source.dashboard, /const canPrintProductionAbnormal = canViewProductionAbnormal\s+&& hasPermission\(user\.role, "production\.abnormal\.print", \[\]\)/));
test("生产进度跟踪表同时要求查看和打印权限", () => assert.match(source.dashboard, /const canPrintProductionProgress = canViewProduction\s+&& hasPermission\(user\.role, "production\.print", \[\]\)/));
test("常用操作数组按权限条件构造", () => {
  for (const gate of ["canCreateOrders", "canViewProduction", "canCreateOutsource", "canCreateReturns", "canCreateDeliveryAction", "canViewBackup"]) assert.match(source.dashboard, new RegExp(`\\.\\.\\.\\(${gate} \\? \\[\\{ label:`));
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
test("外发详情页不额外要求 order.view", () => assert.doesNotMatch(source.outsourceDetail, /order\.view/));
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
test("订单详情页与 Client Manager 不新增写权限标志", () => {
  assert.doesNotMatch(source.orderDetail, /can(?:Create|Update|Upload|SetMain|Obsolete)Drawing/);
  assert.doesNotMatch(source.orderManager, /can(?:Create|Update|Upload|SetMain|Obsolete)Drawing/);
});
test("仅既有图纸读取 API 引用权限助手", async () => {
  const apiRoot = path.join(root, "src/app/api");
  const permittedRoutes = new Set([
    "drawings/[id]/file/route.ts",
    "drawings/[id]/thumbnail/route.ts",
    "drawings/[id]/print-thumbnail/route.ts",
    "parts/[id]/drawings/route.ts"
  ]);
  const { readdir } = await import("node:fs/promises");
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(target);
      if (entry.isFile() && entry.name === "route.ts") {
        const content = await readFile(target, "utf8");
        const relativePath = path.relative(apiRoot, target).replaceAll("\\", "/");
        if (permittedRoutes.has(relativePath)) assert.match(content, /requireApiPermission/);
        else assert.doesNotMatch(content, /requireApi(?:Any|All)?Permission/);
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
