import strictAssert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import nodeTest, { after, before } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let assertionCount = 0; const groupAssertions = [];
const assert = new Proxy(strictAssert, { get(target, property) { const value = Reflect.get(target, property); return typeof value === "function" ? (...args) => { assertionCount += 1; return value.apply(target, args); } : value; } });
function test(name, callback) { return nodeTest(name, async (context) => { const before = assertionCount; await callback(context); groupAssertions.push([name, assertionCount - before]); }); }
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
  return nextResolve(specifier, context);
} });
const { createOutsourceReturnIntegrity, ReturnsIntegrityError, MAX_RETURN_CREATE_ATTEMPTS } = await import("../src/lib/returns-integrity.ts");
const temporaryRoot = path.join(tmpdir(), `jinhong-returns-${process.pid}-${randomUUID()}`);
const databasePath = path.join(temporaryRoot, "returns.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
let client; let competitor; let customer; let sequence = 0; let formalDbHash; let schemaHash;

async function expectError(input, status, message) {
  await assert.rejects(() => createOutsourceReturnIntegrity({ client, input }), (error) => error instanceof ReturnsIntegrityError && error.status === status && error.message === message);
}

function inputFor(outsourceOrderId, outsourceOrderItemId, overrides = {}) {
  return { outsourceOrderId, returnDate: "2035-02-01", items: [{ outsourceOrderItemId, returnQuantity: 1, abnormalQuantity: 0 }], ...overrides };
}

async function seed({ quantity = 5, items = 1, separateParts = false, productStatus = "OUTSOURCING", orderStatus = "OUTSOURCING" } = {}) {
  sequence += 1; const key = `${sequence}-${randomUUID()}`;
  const order = await client.order.create({ data: { orderNo: `RET-${key}`, customerId: customer.id, customerName: customer.name, status: orderStatus } });
  const product = await client.product.create({ data: { orderId: order.id, productName: `产品-${key}`, quantity, status: productStatus } });
  const outsource = await client.outsourceOrder.create({ data: { outsourceNo: `WFRET${Date.now()}${sequence}`, supplierName: "测试厂", outsourceType: "OTHER", outsourceDate: new Date("2035-01-01"), status: "OUTSOURCED" } });
  const parts = separateParts
    ? await Promise.all(Array.from({ length: items }, (_, index) => client.productPart.create({ data: { orderId: order.id, productId: product.id, partName: `部件-${key}-${index + 1}`, totalQuantity: quantity, productQuantity: quantity, outsourcedQuantity: quantity, missingQuantity: quantity, status: "OUTSOURCING" } })))
    : [await client.productPart.create({ data: { orderId: order.id, productId: product.id, partName: `部件-${key}`, totalQuantity: quantity * items, productQuantity: quantity * items, outsourcedQuantity: quantity * items, missingQuantity: quantity * items, status: "OUTSOURCING" } })];
  const orderItems = [];
  for (let index = 0; index < items; index += 1) { const part = parts[separateParts ? index : 0]; orderItems.push(await client.outsourceOrderItem.create({ data: { outsourceOrderId: outsource.id, orderId: order.id, productId: product.id, partId: part.id, partName: part.partName, productName: product.productName, outsourceQuantity: quantity, missingQuantity: quantity, status: "OUTSOURCED" } })); }
  return { order, product, part: parts[0], parts, outsource, items: orderItems };
}

function hash(value) { return createHash("sha256").update(value).digest("hex").toUpperCase(); }
function deferred() { let resolve; let reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; }
async function withTimeout(promise, label) { return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} 超时`)), 5000))]); }
function localDate(value) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }

before(async () => {
  formalDbHash = hash(await readFile(path.join(root, "prisma", "dev.db"))); schemaHash = hash(await readFile(path.join(root, "prisma", "schema.prisma")));
  await mkdir(temporaryRoot, { recursive: false }); await writeFile(databasePath, "");
  const command = process.platform === "win32" ? "npx.cmd prisma migrate deploy --schema prisma/schema.prisma" : "npx prisma migrate deploy --schema prisma/schema.prisma";
  const migration = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", env: { ...process.env, DATABASE_URL: databaseUrl } });
  assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
  client = new PrismaClient({ datasourceUrl: databaseUrl }); competitor = new PrismaClient({ datasourceUrl: databaseUrl });
  await Promise.all([client.$queryRawUnsafe("PRAGMA busy_timeout = 20"), competitor.$queryRawUnsafe("PRAGMA busy_timeout = 20")]);
  customer = await client.customer.create({ data: { name: "回厂临时测试客户" } });
});

after(async () => { await Promise.all([client?.$disconnect(), competitor?.$disconnect()]); await rm(temporaryRoot, { recursive: true, force: true }); assert.equal(hash(await readFile(path.join(root, "prisma", "dev.db"))), formalDbHash); assert.equal(hash(await readFile(path.join(root, "prisma", "schema.prisma"))), schemaHash); await assert.rejects(access(temporaryRoot)); console.log(`回厂真实SQLite有效断言 ${assertionCount}`); console.log(`每组断言 ${groupAssertions.map(([name, count]) => `${name} ${count}/${count}`).join("；")}`); console.log("具名真实场景 20；独立 PrismaClient 2；临时数据库与正式指纹清理通过"); });

test("基础设施使用独立临时 SQLite 和两个 PrismaClient", async () => {
  assert.notEqual(client, competitor); assert.equal(MAX_RETURN_CREATE_ATTEMPTS, 3);
  assert.notEqual(databasePath, path.join(root, "prisma", "dev.db"));
});

test("正常分批回厂维护 Item、Part、状态和业务日期", async () => {
  const fixture = await seed(); const [item] = fixture.items;
  const result = await createOutsourceReturnIntegrity({ client, input: inputFor(fixture.outsource.id, item.id, { returnDate: "2035-02-01", items: [{ outsourceOrderItemId: item.id, returnQuantity: 2, abnormalQuantity: 0 }] }) });
  assert.ok(result.id);
  let [savedItem, part, outsource] = await Promise.all([client.outsourceOrderItem.findUnique({ where: { id: item.id } }), client.productPart.findUnique({ where: { id: fixture.part.id } }), client.outsourceOrder.findUnique({ where: { id: fixture.outsource.id } })]);
  assert.equal(savedItem.returnedQuantity, 2); assert.equal(savedItem.missingQuantity, 3); assert.equal(savedItem.status, "PARTIAL_RETURN"); assert.equal(part.returnedQuantity, 2); assert.equal(part.missingQuantity, 3); assert.equal(part.status, "PARTIAL_RETURN"); assert.equal(outsource.actualReturnDate, null);
  await createOutsourceReturnIntegrity({ client, input: inputFor(fixture.outsource.id, item.id, { returnDate: "2035-02-03", items: [{ outsourceOrderItemId: item.id, returnQuantity: 3, abnormalQuantity: 0 }] }) });
  [savedItem, part, outsource] = await Promise.all([client.outsourceOrderItem.findUnique({ where: { id: item.id } }), client.productPart.findUnique({ where: { id: fixture.part.id } }), client.outsourceOrder.findUnique({ where: { id: fixture.outsource.id } })]);
  assert.equal(savedItem.returnedQuantity, 5); assert.equal(savedItem.missingQuantity, 0); assert.equal(savedItem.status, "RETURNED"); assert.equal(part.returnedQuantity, 5); assert.equal(part.missingQuantity, 0); assert.equal(part.status, "RETURNED"); assert.equal(outsource.status, "RETURNED"); assert.equal(outsource.actualReturnDate.getDate(), 3);
});

const invalidCases = [
  [{}, 400, "外发单信息无效。"],
  [{ outsourceOrderId: "x", returnDate: "2035-02-31", items: [] }, 400, "请至少添加一条回厂明细。"],
  [{ outsourceOrderId: "x", returnDate: "2035-02-31", items: [{ outsourceOrderItemId: "i", returnQuantity: 1 }] }, 400, "回厂日期格式错误。"],
  [{ outsourceOrderId: "x", returnDate: "2035-02-01", handler: 1, items: [{ outsourceOrderItemId: "i", returnQuantity: 1 }] }, 400, "经手人格式无效。"],
  [{ outsourceOrderId: "x", returnDate: "2035-02-01", items: [{ outsourceOrderItemId: "i", returnQuantity: -1 }] }, 400, "回厂数量必须是非负安全整数。"],
  [{ outsourceOrderId: "x", returnDate: "2035-02-01", items: [{ outsourceOrderItemId: "i", returnQuantity: 0, abnormalQuantity: 0 }] }, 400, "正常回厂数量与异常数量合计必须大于0。"],
  [{ outsourceOrderId: "x", returnDate: "2035-02-01", items: [{ outsourceOrderItemId: "i", returnQuantity: 0, abnormalQuantity: 1 }] }, 400, "异常回厂原因不能为空。"]
];
for (const [index, [input, status, message]] of invalidCases.entries()) test(`严格输入 #${index + 1}`, async () => expectError(input, status, message));

test("合计超过 Prisma Int 上限被服务层拒绝", async () => expectError({ outsourceOrderId: "x", returnDate: "2035-02-01", items: [{ outsourceOrderItemId: "i", returnQuantity: 2147483647, abnormalQuantity: 1, abnormalReason: "x" }] }, 400, "回厂数量必须是非负安全整数。"));

test("异常回厂物理数量粘性且回齐仍写实际日期", async () => {
  const fixture = await seed(); const [item] = fixture.items;
  await createOutsourceReturnIntegrity({ client, input: inputFor(fixture.outsource.id, item.id, { returnDate: "2035-02-05", items: [{ outsourceOrderItemId: item.id, returnQuantity: 0, abnormalQuantity: 5, abnormalReason: "瑕疵" }] }) });
  const [savedItem, part, product, order, outsource, returnItem] = await Promise.all([client.outsourceOrderItem.findUnique({ where: { id: item.id } }), client.productPart.findUnique({ where: { id: fixture.part.id } }), client.product.findUnique({ where: { id: fixture.product.id } }), client.order.findUnique({ where: { id: fixture.order.id } }), client.outsourceOrder.findUnique({ where: { id: fixture.outsource.id } }), client.outsourceReturnItem.findFirst({ where: { outsourceOrderItemId: item.id } })]);
  assert.equal(returnItem.abnormalQuantity, 5); assert.equal(returnItem.abnormalReason, "瑕疵"); assert.equal(savedItem.returnedQuantity, 5); assert.equal(savedItem.status, "ABNORMAL"); assert.equal(part.status, "ABNORMAL"); assert.equal(product.status, "ABNORMAL"); assert.equal(order.status, "ABNORMAL"); assert.equal(outsource.status, "ABNORMAL"); assert.equal(outsource.actualReturnDate.getDate(), 5);
});

test("同 Part 多 Item 只执行一次 Part 条件更新并可整单回滚", async () => {
  const fixture = await seed({ quantity: 2, items: 2 }); let partUpdates = 0;
  await createOutsourceReturnIntegrity({ client, input: { outsourceOrderId: fixture.outsource.id, returnDate: "2035-02-01", items: fixture.items.map((item) => ({ outsourceOrderItemId: item.id, returnQuantity: 1, abnormalQuantity: 0 })) }, dependencies: { beforePartConditionalUpdate: () => { partUpdates += 1; } } });
  const part = await client.productPart.findUnique({ where: { id: fixture.part.id } }); assert.equal(partUpdates, 1); assert.equal(part.returnedQuantity, 2); assert.equal(part.missingQuantity, 2);
  const rollback = await seed({ quantity: 2, items: 2 }); const before = await client.outsourceReturn.count();
  await expectError({ outsourceOrderId: rollback.outsource.id, returnDate: "2035-02-01", items: [{ outsourceOrderItemId: rollback.items[0].id, returnQuantity: 1 }, { outsourceOrderItemId: rollback.items[1].id, returnQuantity: 3 }] }, 409, "回厂数量超过当前未回数量。");
  assert.equal(await client.outsourceReturn.count(), before); assert.equal((await client.productPart.findUnique({ where: { id: rollback.part.id } })).returnedQuantity, 0);
});

test("产品与订单送货和异常状态受到保护", async () => {
  const deliveredProduct = await seed({ productStatus: "PARTIAL_DELIVERED" });
  await createOutsourceReturnIntegrity({ client, input: inputFor(deliveredProduct.outsource.id, deliveredProduct.items[0].id) });
  assert.equal((await client.product.findUnique({ where: { id: deliveredProduct.product.id } })).status, "PARTIAL_DELIVERED");
  const completedProduct = await seed({ productStatus: "COMPLETED" }); const count = await client.outsourceReturn.count();
  await expectError(inputFor(completedProduct.outsource.id, completedProduct.items[0].id), 409, "已完成产品不能登记回厂。");
  assert.equal(await client.outsourceReturn.count(), count); assert.equal((await client.outsourceOrderItem.findUnique({ where: { id: completedProduct.items[0].id } })).returnedQuantity, 0);
  const deliveredOrder = await seed({ orderStatus: "PARTIAL_DELIVERED" });
  await createOutsourceReturnIntegrity({ client, input: inputFor(deliveredOrder.outsource.id, deliveredOrder.items[0].id) });
  assert.equal((await client.order.findUnique({ where: { id: deliveredOrder.order.id } })).status, "PARTIAL_DELIVERED");
  const completedOrder = await seed({ orderStatus: "COMPLETED" });
  await expectError(inputFor(completedOrder.outsource.id, completedOrder.items[0].id), 409, "已完成订单不能登记回厂。");
});

test("相同请求在余量足够时创建独立业务回厂单，超量不留记录", async () => {
  const fixture = await seed({ quantity: 3 }); const request = inputFor(fixture.outsource.id, fixture.items[0].id);
  await createOutsourceReturnIntegrity({ client, input: request }); await createOutsourceReturnIntegrity({ client, input: request });
  assert.equal(await client.outsourceReturn.count({ where: { outsourceOrderId: fixture.outsource.id } }), 2);
  assert.equal(await client.outsourceReturnItem.count({ where: { outsourceOrderItemId: fixture.items[0].id } }), 2);
  const item = await client.outsourceOrderItem.findUnique({ where: { id: fixture.items[0].id } }); assert.equal(item.returnedQuantity, 2); assert.equal(item.missingQuantity, 1);
  const before = await client.outsourceReturn.count({ where: { outsourceOrderId: fixture.outsource.id } });
  await expectError(inputFor(fixture.outsource.id, fixture.items[0].id, { items: [{ outsourceOrderItemId: fixture.items[0].id, returnQuantity: 2 }] }), 409, "回厂数量超过当前未回数量。");
  assert.equal(await client.outsourceReturn.count({ where: { outsourceOrderId: fixture.outsource.id } }), before);
});

test("Prisma真实类型稳定分类不进入重试", async () => {
  for (const [code, message] of [["P2002", "数据发生唯一性冲突，请刷新后重试。"], ["P2003", "关联数据已变化，请刷新后重试。"], ["P2025", "数据状态已变化，请刷新后重试。"]]) {
    const error = new Prisma.PrismaClientKnownRequestError("temporary database test", { code, clientVersion: Prisma.prismaVersion.client });
    assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
    let attempts = 0;
    await assert.rejects(() => createOutsourceReturnIntegrity({ client, input: { outsourceOrderId: "x", returnDate: "2035-02-01", items: [{ outsourceOrderItemId: "i", returnQuantity: 1 }] }, dependencies: { beforeTransactionAttempt: () => { attempts += 1; }, transaction: async () => { throw error; } } }), (actual) => actual instanceof ReturnsIntegrityError && actual.status === 409 && actual.message === message);
    assert.equal(attempts, 1);
  }
});

test("同Item双Client真实锁并发", async () => {
  const fixture = await seed({ quantity: 1 }); const item = fixture.items[0]; const reached = deferred(); const release = deferred(); let attempts = 0;
  const requestA = createOutsourceReturnIntegrity({ client, input: inputFor(fixture.outsource.id, item.id), dependencies: { beforeOutsourceOrderConditionalUpdate: async () => { reached.resolve(); await release.promise; } } });
  try {
    await withTimeout(reached.promise, "A写锁");
    const requestB = createOutsourceReturnIntegrity({ client: competitor, input: inputFor(fixture.outsource.id, item.id), dependencies: { beforeTransactionAttempt: () => { attempts += 1; }, sleep: async () => { release.resolve(); } } });
    const savedA = await withTimeout(requestA, "A提交"); assert.ok(savedA.id);
    await assert.rejects(() => withTimeout(requestB, "B重试"), (error) => error instanceof ReturnsIntegrityError && error.status === 409);
  } finally { release.resolve(); await Promise.allSettled([requestA]); }
  const [saved, part, returns, returnItems] = await Promise.all([client.outsourceOrderItem.findUnique({ where: { id: item.id } }), client.productPart.findUnique({ where: { id: fixture.part.id } }), client.outsourceReturn.findMany({ where: { outsourceOrderId: fixture.outsource.id } }), client.outsourceReturnItem.findMany({ where: { outsourceOrderItemId: item.id } })]);
  assert.ok(attempts > 1); assert.ok(attempts <= 3); assert.equal(saved.returnedQuantity, 1); assert.equal(saved.missingQuantity, 0); assert.equal(returns.length, 1); assert.equal(returnItems.length, 1); assert.equal(part.returnedQuantity, 1); assert.equal(part.missingQuantity, 0);
});

test("同Part不同Item真实锁并发累计", async () => {
  const fixture = await seed({ quantity: 1, items: 2 }); const reached = deferred(); const release = deferred(); let attempts = 0;
  const requestA = createOutsourceReturnIntegrity({ client, input: inputFor(fixture.outsource.id, fixture.items[0].id), dependencies: { beforeOutsourceOrderConditionalUpdate: async () => { reached.resolve(); await release.promise; } } });
  try {
    await withTimeout(reached.promise, "同Part A写锁");
    const requestB = createOutsourceReturnIntegrity({ client: competitor, input: inputFor(fixture.outsource.id, fixture.items[1].id), dependencies: { beforeTransactionAttempt: () => { attempts += 1; }, sleep: async () => { release.resolve(); } } });
    await withTimeout(requestA, "同Part A提交"); const savedB = await withTimeout(requestB, "同Part B重试"); assert.ok(savedB.id);
  } finally { release.resolve(); await Promise.allSettled([requestA]); }
  const [first, second, part, returns, returnItems] = await Promise.all([client.outsourceOrderItem.findUnique({ where: { id: fixture.items[0].id } }), client.outsourceOrderItem.findUnique({ where: { id: fixture.items[1].id } }), client.productPart.findUnique({ where: { id: fixture.part.id } }), client.outsourceReturn.findMany({ where: { outsourceOrderId: fixture.outsource.id } }), client.outsourceReturnItem.findMany({ where: { partId: fixture.part.id } })]);
  assert.ok(attempts > 1); assert.ok(attempts <= 3); assert.equal(first.returnedQuantity, 1); assert.equal(first.missingQuantity, 0); assert.equal(second.returnedQuantity, 1); assert.equal(second.missingQuantity, 0); assert.equal(part.returnedQuantity, 2); assert.equal(part.missingQuantity, 0); assert.equal(part.outsourcedQuantity, 2); assert.equal(part.totalQuantity, 2); assert.equal(returns.length, 2); assert.equal(returnItems.length, 2);
});

test("actualReturnDate正常并发最大日期", async () => {
  const fixture = await seed({ quantity: 1, items: 2, separateParts: true }); const reached = deferred(); const release = deferred(); let attempts = 0; let requestB;
  const requestA = createOutsourceReturnIntegrity({ client, input: inputFor(fixture.outsource.id, fixture.items[0].id, { returnDate: "2026-07-15" }), dependencies: { beforeOutsourceOrderConditionalUpdate: async () => { reached.resolve(); await release.promise; } } });
  try {
    await withTimeout(reached.promise, "最大日期 A写锁");
    requestB = createOutsourceReturnIntegrity({ client: competitor, input: inputFor(fixture.outsource.id, fixture.items[1].id, { returnDate: "2026-07-13" }), dependencies: { beforeTransactionAttempt: () => { attempts += 1; }, sleep: async () => { release.resolve(); } } });
    const [savedA, savedB] = await Promise.all([withTimeout(requestA, "最大日期 A提交"), withTimeout(requestB, "最大日期 B重试")]); assert.ok(savedA.id); assert.ok(savedB.id);
  } finally { release.resolve(); await Promise.allSettled([requestA, requestB]); }
  const [outsource, items, returns, returnItems, parts] = await Promise.all([client.outsourceOrder.findUnique({ where: { id: fixture.outsource.id } }), client.outsourceOrderItem.findMany({ where: { outsourceOrderId: fixture.outsource.id }, orderBy: { id: "asc" } }), client.outsourceReturn.findMany({ where: { outsourceOrderId: fixture.outsource.id } }), client.outsourceReturnItem.findMany({ where: { outsourceOrderItem: { outsourceOrderId: fixture.outsource.id } } }), client.productPart.findMany({ where: { id: { in: fixture.parts.map((part) => part.id) } } })]);
  const latestReturnTime = Math.max(...returns.map((item) => item.returnDate.getTime()));
  assert.ok(attempts > 1); assert.ok(attempts <= 3); assert.equal(outsource.status, "RETURNED"); assert.equal(localDate(outsource.actualReturnDate), "2026-07-15"); assert.equal(outsource.actualReturnDate.getTime(), latestReturnTime); assert.equal(returns.length, 2); assert.equal(returnItems.length, 2); assert.equal(latestReturnTime, new Date(2026, 6, 15).getTime()); assert.deepEqual(returns.map((item) => localDate(item.returnDate)).sort(), ["2026-07-13", "2026-07-15"]); assert.deepEqual(items.map((item) => item.returnedQuantity), [1, 1]); assert.deepEqual(items.map((item) => item.missingQuantity), [0, 0]); assert.deepEqual(parts.map((part) => [part.returnedQuantity, part.missingQuantity, part.status]).sort(), [[1, 0, "RETURNED"], [1, 0, "RETURNED"]]); assert.equal(new Set(returnItems.map((item) => item.outsourceOrderItemId)).size, 2);
});

test("actualReturnDate异常并发最大日期", async () => {
  const fixture = await seed({ quantity: 1, items: 2, separateParts: true }); const reached = deferred(); const release = deferred(); let attempts = 0; let requestB;
  const requestA = createOutsourceReturnIntegrity({ client, input: inputFor(fixture.outsource.id, fixture.items[0].id, { returnDate: "2026-07-15", items: [{ outsourceOrderItemId: fixture.items[0].id, returnQuantity: 0, abnormalQuantity: 1, abnormalReason: "并发异常回厂测试" }] }), dependencies: { beforeOutsourceOrderConditionalUpdate: async () => { reached.resolve(); await release.promise; } } });
  try {
    await withTimeout(reached.promise, "异常最大日期 A写锁");
    requestB = createOutsourceReturnIntegrity({ client: competitor, input: inputFor(fixture.outsource.id, fixture.items[1].id, { returnDate: "2026-07-13" }), dependencies: { beforeTransactionAttempt: () => { attempts += 1; }, sleep: async () => { release.resolve(); } } });
    const [savedA, savedB] = await Promise.all([withTimeout(requestA, "异常最大日期 A提交"), withTimeout(requestB, "异常最大日期 B重试")]); assert.ok(savedA.id); assert.ok(savedB.id);
  } finally { release.resolve(); await Promise.allSettled([requestA, requestB]); }
  const [outsource, items, returns, returnItems, parts, product, order] = await Promise.all([client.outsourceOrder.findUnique({ where: { id: fixture.outsource.id } }), client.outsourceOrderItem.findMany({ where: { outsourceOrderId: fixture.outsource.id }, orderBy: { id: "asc" } }), client.outsourceReturn.findMany({ where: { outsourceOrderId: fixture.outsource.id } }), client.outsourceReturnItem.findMany({ where: { outsourceOrderItem: { outsourceOrderId: fixture.outsource.id } } }), client.productPart.findMany({ where: { id: { in: fixture.parts.map((part) => part.id) } } }), client.product.findUnique({ where: { id: fixture.product.id } }), client.order.findUnique({ where: { id: fixture.order.id } })]);
  const latestReturnTime = Math.max(...returns.map((item) => item.returnDate.getTime())); const abnormalPart = parts.find((part) => part.id === fixture.parts[0].id); const normalPart = parts.find((part) => part.id === fixture.parts[1].id);
  assert.ok(attempts > 1); assert.ok(attempts <= 3); assert.equal(outsource.status, "ABNORMAL"); assert.equal(localDate(outsource.actualReturnDate), "2026-07-15"); assert.equal(outsource.actualReturnDate.getTime(), latestReturnTime); assert.equal(items[0].status, "ABNORMAL"); assert.equal(items[0].returnedQuantity, 1); assert.equal(items[0].missingQuantity, 0); assert.equal(items[1].returnedQuantity, 1); assert.equal(items[1].missingQuantity, 0); assert.equal(abnormalPart.status, "ABNORMAL"); assert.equal(abnormalPart.returnedQuantity, 1); assert.equal(abnormalPart.missingQuantity, 0); assert.equal(normalPart.status, "RETURNED"); assert.equal(product.status, "ABNORMAL"); assert.equal(order.status, "ABNORMAL"); assert.equal(returns.length, 2); assert.equal(returnItems.length, 2); assert.equal(latestReturnTime, new Date(2026, 6, 15).getTime()); assert.deepEqual(returns.map((item) => localDate(item.returnDate)).sort(), ["2026-07-13", "2026-07-15"]); assert.equal(returnItems.find((item) => item.outsourceOrderItemId === fixture.items[0].id).abnormalQuantity, 1); assert.equal(returnItems.find((item) => item.outsourceOrderItemId === fixture.items[1].id).abnormalQuantity, 0);
});

test("真实SQLite锁三次耗尽503", async () => {
  const lockFixture = await seed({ quantity: 1 }); const targetFixture = await seed({ quantity: 1 }); const reached = deferred(); const release = deferred(); let attempts = 0; let sleeps = 0; let requestB;
  const requestA = createOutsourceReturnIntegrity({ client, input: inputFor(lockFixture.outsource.id, lockFixture.items[0].id), dependencies: { beforeOutsourceOrderConditionalUpdate: async () => { reached.resolve(); await release.promise; } } });
  try {
    await withTimeout(reached.promise, "耗尽 A写锁");
    requestB = createOutsourceReturnIntegrity({ client: competitor, input: inputFor(targetFixture.outsource.id, targetFixture.items[0].id), dependencies: { beforeTransactionAttempt: () => { attempts += 1; }, sleep: async () => { sleeps += 1; } } });
    await assert.rejects(() => withTimeout(requestB, "耗尽 B完成"), (error) => error instanceof ReturnsIntegrityError && error.status === 503 && error.message === "系统繁忙，请稍后重试。");
  } finally { release.resolve(); await Promise.allSettled([requestA, requestB]); }
  const [item, part, product, targetOrder, outsource, returns, returnItems, lockReturns] = await Promise.all([client.outsourceOrderItem.findUnique({ where: { id: targetFixture.items[0].id } }), client.productPart.findUnique({ where: { id: targetFixture.part.id } }), client.product.findUnique({ where: { id: targetFixture.product.id } }), client.order.findUnique({ where: { id: targetFixture.order.id } }), client.outsourceOrder.findUnique({ where: { id: targetFixture.outsource.id } }), client.outsourceReturn.count({ where: { outsourceOrderId: targetFixture.outsource.id } }), client.outsourceReturnItem.count({ where: { outsourceOrderItemId: targetFixture.items[0].id } }), client.outsourceReturn.count({ where: { outsourceOrderId: lockFixture.outsource.id } })]);
  assert.equal(attempts, 3); assert.equal(sleeps, 2); assert.equal(item.returnedQuantity, 0); assert.equal(item.missingQuantity, 1); assert.equal(part.returnedQuantity, 0); assert.equal(part.missingQuantity, 1); assert.equal(product.status, "OUTSOURCING"); assert.equal(targetOrder.status, "OUTSOURCING"); assert.equal(outsource.status, "OUTSOURCED"); assert.equal(outsource.actualReturnDate, null); assert.equal(returns, 0); assert.equal(returnItems, 0); assert.equal(lockReturns, 1);
});
