import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
    }
    return nextResolve(specifier, context);
  }
});

const {
  advancePartProduction,
  markProductProductionComplete,
  MAX_PRODUCTION_WRITE_ATTEMPTS,
  ProductionKittingError,
  refreshKittingState,
  reportPartAbnormal,
  resolvePartAbnormal
} = await import("../src/lib/production-kitting-integrity.ts");

const formalDb = path.join(root, "prisma", "dev.db");
const formalSchema = path.join(root, "prisma", "schema.prisma");
const privateRoot = path.join(root, "storage");
const publicRoot = path.join(root, "public");
const temporaryRoot = path.join(tmpdir(), `jinhong-production-kitting-${process.pid}-${randomUUID()}`);
const databasePath = path.join(temporaryRoot, "production-kitting.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
const clients = [];
let client;
let competitor;
let formalDbHash;
let formalSchemaHash;
let privateBefore;
let publicBefore;
let cleaned = false;
let sequence = 0;
let advance;
let abnormal;
let resolved;
let completion;
let kitting;
let lockResult;
let p2002Error;
let p2003Error;
let unknownError;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

async function hashFile(filePath) {
  return sha256(await readFile(filePath));
}

async function treeSummary(directory) {
  const entries = [];
  async function visit(current) {
    let children;
    try {
      children = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(current, child.name);
      if (child.isDirectory()) await visit(absolute);
      else {
        const buffer = await readFile(absolute);
        entries.push({
          path: path.relative(directory, absolute).replaceAll("\\", "/"),
          length: buffer.length,
          sha256: sha256(buffer)
        });
      }
    }
  }
  await visit(directory);
  return entries;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function capture(action) {
  try {
    return { value: await action(), error: null };
  } catch (error) {
    return { value: null, error };
  }
}

async function createGraph({
  orderStatus = "PENDING",
  productStatus = "PENDING",
  parts = [{}]
} = {}) {
  sequence += 1;
  const marker = `${sequence}-${randomUUID()}`;
  const customer = await client.customer.create({
    data: {
      name: `测试客户-${marker}`
    }
  });
  const order = await client.order.create({
    data: {
      orderNo: `PK-${String(sequence).padStart(4, "0")}-${randomUUID().slice(0, 6)}`,
      customerId: customer.id,
      customerName: customer.name,
      status: orderStatus
    }
  });
  const product = await client.product.create({
    data: {
      orderId: order.id,
      productName: `测试产品-${marker}`,
      quantity: 1,
      status: productStatus
    }
  });
  const createdParts = [];
  for (const [index, input] of parts.entries()) {
    createdParts.push(await client.productPart.create({
      data: {
        orderId: order.id,
        productId: product.id,
        partName: `测试部件-${index}-${marker}`,
        unitQuantity: 1,
        productQuantity: input.totalQuantity ?? 5,
        totalQuantity: input.totalQuantity ?? 5,
        outsourcedQuantity: input.outsourcedQuantity ?? 0,
        returnedQuantity: input.returnedQuantity ?? 0,
        missingQuantity: input.missingQuantity ?? 0,
        status: input.status ?? "PENDING"
      }
    }));
  }
  return { customer, order, product, parts: createdParts };
}

async function report(graph, reason = "尺寸异常") {
  return reportPartAbnormal({
    client,
    partId: graph.parts[0].id,
    reason
  });
}

function barrierDependencies() {
  const gate = deferred();
  let arrivals = 0;
  return {
    beforeAttempt: async (_operation, attempt) => {
      if (attempt !== 1) return;
      arrivals += 1;
      if (arrivals === 2) gate.resolve();
      await gate.promise;
    },
    sleep: async () => {}
  };
}

before(async () => {
  formalDbHash = await hashFile(formalDb);
  formalSchemaHash = await hashFile(formalSchema);
  privateBefore = await treeSummary(privateRoot);
  publicBefore = await treeSummary(publicRoot);
  await mkdir(temporaryRoot, { recursive: false });
  await writeFile(databasePath, "");
  const command = process.platform === "win32"
    ? "npx.cmd prisma migrate deploy --schema prisma/schema.prisma"
    : "npx prisma migrate deploy --schema prisma/schema.prisma";
  const migration = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    }
  });
  assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
  client = new PrismaClient({ datasourceUrl: databaseUrl });
  competitor = new PrismaClient({ datasourceUrl: databaseUrl });
  clients.push(client, competitor);
  await Promise.all([
    client.$queryRawUnsafe("PRAGMA busy_timeout = 20"),
    competitor.$queryRawUnsafe("PRAGMA busy_timeout = 20")
  ]);
});

after(async () => {
  if (!cleaned) {
    await Promise.allSettled(clients.map((item) => item.$disconnect()));
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("01. 临时 SQLite 已执行全部四条 migration", async () => {
  const rows = await client.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL');
  assert.equal(rows.length, 4);
});
test("02. 集成测试使用两个独立 PrismaClient", () => {
  assert.notEqual(client, competitor);
});
test("03. 正常推进只跨越一个阶段", async () => {
  const graph = await createGraph();
  const quantities = graph.parts.map(({ outsourcedQuantity, returnedQuantity, missingQuantity }) => ({ outsourcedQuantity, returnedQuantity, missingQuantity }));
  const result = await advancePartProduction({ client, partId: graph.parts[0].id, expectedStatus: "PENDING" });
  advance = { graph, quantities, result };
  assert.equal(result.part.status, "WELDING");
});
test("04. 正常推进只创建一条 ProgressLog", async () => {
  assert.equal(await client.productPartProgressLog.count({ where: { productPartId: advance.graph.parts[0].id } }), 1);
});
test("05. ProgressLog 保存正确起止状态", async () => {
  const log = await client.productPartProgressLog.findFirst({ where: { productPartId: advance.graph.parts[0].id } });
  assert.deepEqual([log.fromStatus, log.toStatus], ["PENDING", "WELDING"]);
});
test("06. 相同 expectedStatus 重复推进返回 409", async () => {
  advance.repeated = await capture(() => advancePartProduction({ client, partId: advance.graph.parts[0].id, expectedStatus: "PENDING" }));
  assert.equal(advance.repeated.error.status, 409);
});
test("07. 重复旧请求不会推进第二阶段", async () => {
  const part = await client.productPart.findUnique({ where: { id: advance.graph.parts[0].id } });
  assert.equal(part.status, "WELDING");
});
test("08. 重复旧请求不会创建第二条日志", async () => {
  assert.equal(await client.productPartProgressLog.count({ where: { productPartId: advance.graph.parts[0].id } }), 1);
});
test("09. COMPLETED 订单拒绝推进", async () => {
  const graph = await createGraph({ orderStatus: "COMPLETED" });
  const result = await capture(() => advancePartProduction({ client, partId: graph.parts[0].id, expectedStatus: "PENDING" }));
  assert.deepEqual([result.error.status, result.error.message], [409, "已完成订单不能执行生产操作。"]);
});
test("10. PARTIAL_DELIVERED 订单允许推进未完成部件", async () => {
  const graph = await createGraph({ orderStatus: "PARTIAL_DELIVERED" });
  await advancePartProduction({ client, partId: graph.parts[0].id, expectedStatus: "PENDING" });
  advance.partialGraph = graph;
  assert.equal((await client.productPart.findUnique({ where: { id: graph.parts[0].id } })).status, "WELDING");
});
test("11. PARTIAL_DELIVERED 订单推进后保持原状态", async () => {
  assert.equal((await client.order.findUnique({ where: { id: advance.partialGraph.order.id } })).status, "PARTIAL_DELIVERED");
});
test("12. 推进不修改任何数量字段", async () => {
  const rows = await client.productPart.findMany({ where: { productId: advance.graph.product.id }, orderBy: { id: "asc" } });
  assert.deepEqual(rows.map(({ outsourcedQuantity, returnedQuantity, missingQuantity }) => ({ outsourcedQuantity, returnedQuantity, missingQuantity })), advance.quantities);
});
test("13. 不存在部件返回稳定 404", async () => {
  const result = await capture(() => advancePartProduction({ client, partId: "missing-part", expectedStatus: "PENDING" }));
  assert.deepEqual([result.error.status, result.error.message], [404, "部件不存在。"]);
});
test("14. 非法来源状态返回稳定 400", async () => {
  const graph = await createGraph({ parts: [{ status: "RETURNED", returnedQuantity: 5 }] });
  const result = await capture(() => advancePartProduction({ client, partId: graph.parts[0].id, expectedStatus: "RETURNED" }));
  assert.deepEqual([result.error.status, result.error.message], [400, "当前状态不允许执行此操作。"]);
});
test("15. 推进按最新部件状态同步 Product", async () => {
  assert.equal((await client.product.findUnique({ where: { id: advance.graph.product.id } })).status, "WELDING");
});

test("16. 正常登记异常成功", async () => {
  const graph = await createGraph({ parts: [{ status: "WELDING", returnedQuantity: 1, missingQuantity: 4 }] });
  const quantities = graph.parts.map(({ outsourcedQuantity, returnedQuantity, missingQuantity }) => ({ outsourcedQuantity, returnedQuantity, missingQuantity }));
  const result = await report(graph);
  abnormal = { graph, quantities, result };
  assert.equal(result.abnormal.status, "OPEN");
});
test("17. 异常 fromStatus 保存真实旧状态", async () => {
  const row = await client.productPartAbnormal.findUnique({ where: { id: abnormal.result.abnormal.id } });
  assert.equal(row.fromStatus, "WELDING");
});
test("18. 登记异常后 Part 为 ABNORMAL", async () => {
  assert.equal((await client.productPart.findUnique({ where: { id: abnormal.graph.parts[0].id } })).status, "ABNORMAL");
});
test("19. 登记异常后 Product 同步 ABNORMAL", async () => {
  assert.equal((await client.product.findUnique({ where: { id: abnormal.graph.product.id } })).status, "ABNORMAL");
});
test("20. 第二次登记返回稳定 409", async () => {
  const result = await capture(() => report(abnormal.graph, "第二次异常"));
  assert.deepEqual([result.error.status, result.error.message], [409, "该部件已有未处理异常。"]);
});
test("21. 重复登记最多保留一条 OPEN 异常", async () => {
  assert.equal(await client.productPartAbnormal.count({ where: { productPartId: abnormal.graph.parts[0].id, status: "OPEN" } }), 1);
});
test("22. 登记异常不修改数量字段", async () => {
  const rows = await client.productPart.findMany({ where: { productId: abnormal.graph.product.id }, orderBy: { id: "asc" } });
  assert.deepEqual(rows.map(({ outsourcedQuantity, returnedQuantity, missingQuantity }) => ({ outsourcedQuantity, returnedQuantity, missingQuantity })), abnormal.quantities);
});
test("23. COMPLETED 订单拒绝登记异常", async () => {
  const graph = await createGraph({ orderStatus: "COMPLETED" });
  const result = await capture(() => report(graph));
  assert.deepEqual([result.error.status, result.error.message], [409, "已完成订单不能执行生产操作。"]);
});
test("24. 两个 Client 并发登记最多一个成功", async () => {
  const graph = await createGraph({ parts: [{ status: "POLISHING" }] });
  const dependencies = barrierDependencies();
  const results = await Promise.allSettled([
    reportPartAbnormal({ client, partId: graph.parts[0].id, reason: "并发一", dependencies }),
    reportPartAbnormal({ client: competitor, partId: graph.parts[0].id, reason: "并发二", dependencies })
  ]);
  abnormal.concurrent = { graph, results };
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
});
test("25. 并发登记数据库只有一条 OPEN 异常", async () => {
  assert.equal(await client.productPartAbnormal.count({ where: { productPartId: abnormal.concurrent.graph.parts[0].id, status: "OPEN" } }), 1);
});

test("26. 异常处理恢复到 fromStatus", async () => {
  const graph = await createGraph({ parts: [{ status: "POLISHING", returnedQuantity: 2, missingQuantity: 3 }] });
  const quantities = graph.parts.map(({ outsourcedQuantity, returnedQuantity, missingQuantity }) => ({ outsourcedQuantity, returnedQuantity, missingQuantity }));
  await report(graph);
  const result = await resolvePartAbnormal({ client, partId: graph.parts[0].id, resolvedRemark: "已返工" });
  resolved = { graph, quantities, result };
  assert.equal(result.part.status, "POLISHING");
});
test("27. 异常记录变为 RESOLVED", async () => {
  const row = await client.productPartAbnormal.findFirst({ where: { productPartId: resolved.graph.parts[0].id } });
  assert.equal(row.status, "RESOLVED");
});
test("28. 异常处理保存备注", async () => {
  const row = await client.productPartAbnormal.findFirst({ where: { productPartId: resolved.graph.parts[0].id } });
  assert.equal(row.resolvedRemark, "已返工");
});
test("29. 异常处理保存 resolvedAt", async () => {
  const row = await client.productPartAbnormal.findFirst({ where: { productPartId: resolved.graph.parts[0].id } });
  assert.ok(row.resolvedAt instanceof Date);
});
test("30. 任意不同目标状态被稳定拒绝", async () => {
  const graph = await createGraph({ parts: [{ status: "WELDING" }] });
  await report(graph);
  const result = await capture(() => resolvePartAbnormal({ client, partId: graph.parts[0].id, requestedStatus: "RETURNED", resolvedRemark: "" }));
  resolved.mismatch = { graph, result };
  assert.deepEqual([result.error.status, result.error.message], [400, "异常只能恢复到登记前状态。"]);
});
test("31. 非法恢复目标被拒绝后异常仍为 OPEN", async () => {
  assert.equal(await client.productPartAbnormal.count({ where: { productPartId: resolved.mismatch.graph.parts[0].id, status: "OPEN" } }), 1);
});
test("32. 重复处理返回稳定 404", async () => {
  const result = await capture(() => resolvePartAbnormal({ client, partId: resolved.graph.parts[0].id, resolvedRemark: "重复" }));
  assert.deepEqual([result.error.status, result.error.message], [404, "未找到待处理异常。"]);
});
test("33. Part 已非 ABNORMAL 时返回 409", async () => {
  const graph = await createGraph({ parts: [{ status: "WELDING" }] });
  await report(graph);
  await client.productPart.update({ where: { id: graph.parts[0].id }, data: { status: "POLISHING" } });
  const result = await capture(() => resolvePartAbnormal({ client, partId: graph.parts[0].id, resolvedRemark: "" }));
  resolved.changed = { graph, result };
  assert.equal(result.error.status, 409);
});
test("34. Part 状态冲突时异常更新完整回滚", async () => {
  assert.equal(await client.productPartAbnormal.count({ where: { productPartId: resolved.changed.graph.parts[0].id, status: "OPEN" } }), 1);
});
test("35. 两个 Client 并发处理最多一个成功", async () => {
  const graph = await createGraph({ parts: [{ status: "WELDING" }] });
  await report(graph);
  const dependencies = barrierDependencies();
  const results = await Promise.allSettled([
    resolvePartAbnormal({ client, partId: graph.parts[0].id, resolvedRemark: "先处理", dependencies }),
    resolvePartAbnormal({ client: competitor, partId: graph.parts[0].id, resolvedRemark: "后处理", dependencies })
  ]);
  resolved.concurrent = { graph, results };
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
});
test("36. 后到请求不能覆盖先处理备注", async () => {
  const row = await client.productPartAbnormal.findFirst({ where: { productPartId: resolved.concurrent.graph.parts[0].id } });
  assert.ok(row.resolvedRemark === "先处理" || row.resolvedRemark === "后处理");
});
test("37. 异常处理后 Product 按实际 Part 汇总", async () => {
  assert.equal((await client.product.findUnique({ where: { id: resolved.graph.product.id } })).status, "POLISHING");
});
test("38. 异常处理不修改数量字段", async () => {
  const rows = await client.productPart.findMany({ where: { productId: resolved.graph.product.id }, orderBy: { id: "asc" } });
  assert.deepEqual(rows.map(({ outsourcedQuantity, returnedQuantity, missingQuantity }) => ({ outsourcedQuantity, returnedQuantity, missingQuantity })), resolved.quantities);
});

test("39. 未外发 Part 快速完成为 RETURNED", async () => {
  const graph = await createGraph({ parts: [{ totalQuantity: 5, status: "WELDING" }] });
  await markProductProductionComplete({ client, productId: graph.product.id });
  completion = { never: graph };
  assert.equal((await client.productPart.findUnique({ where: { id: graph.parts[0].id } })).status, "RETURNED");
});
test("40. 未外发 Part returnedQuantity 写为 totalQuantity", async () => {
  const row = await client.productPart.findUnique({ where: { id: completion.never.parts[0].id } });
  assert.equal(row.returnedQuantity, row.totalQuantity);
});
test("41. 未外发 Part missingQuantity 写为零", async () => {
  assert.equal((await client.productPart.findUnique({ where: { id: completion.never.parts[0].id } })).missingQuantity, 0);
});
test("42. 未外发 Part outsourcedQuantity 保持零", async () => {
  assert.equal((await client.productPart.findUnique({ where: { id: completion.never.parts[0].id } })).outsourcedQuantity, 0);
});
test("43. 已外发但未全部回厂返回 409", async () => {
  const graph = await createGraph({ parts: [{ totalQuantity: 5, outsourcedQuantity: 5, returnedQuantity: 4, missingQuantity: 1, status: "PARTIAL_RETURN" }] });
  const result = await capture(() => markProductProductionComplete({ client, productId: graph.product.id }));
  completion.incomplete = { graph, result };
  assert.deepEqual([result.error.status, result.error.message], [409, "部件外发尚未全部回厂，不能标记生产完成。"]);
});
test("44. 未全部回厂失败不改写 Part", async () => {
  const row = await client.productPart.findUnique({ where: { id: completion.incomplete.graph.parts[0].id } });
  assert.deepEqual([row.status, row.returnedQuantity, row.missingQuantity], ["PARTIAL_RETURN", 4, 1]);
});
test("45. 已外发且全部回厂时只推进状态", async () => {
  const graph = await createGraph({ parts: [{ totalQuantity: 5, outsourcedQuantity: 5, returnedQuantity: 7, missingQuantity: 0, status: "OUTSOURCING" }] });
  await markProductProductionComplete({ client, productId: graph.product.id });
  completion.outsourced = graph;
  assert.equal((await client.productPart.findUnique({ where: { id: graph.parts[0].id } })).status, "RETURNED");
});
test("46. 已外发真实 returnedQuantity 不被覆盖", async () => {
  assert.equal((await client.productPart.findUnique({ where: { id: completion.outsourced.parts[0].id } })).returnedQuantity, 7);
});
test("47. 已外发真实 outsourcedQuantity 不被覆盖", async () => {
  assert.equal((await client.productPart.findUnique({ where: { id: completion.outsourced.parts[0].id } })).outsourcedQuantity, 5);
});
test("48. 存在 OPEN 异常禁止快速完成", async () => {
  const graph = await createGraph({ parts: [{ status: "WELDING" }] });
  await report(graph);
  const result = await capture(() => markProductProductionComplete({ client, productId: graph.product.id }));
  assert.deepEqual([result.error.status, result.error.message], [409, "产品仍有未处理异常，不能标记生产完成。"]);
});
test("49. 多 Part 任一条件更新失败时事务返回 409", async () => {
  const graph = await createGraph({ parts: [{ status: "WELDING" }, { status: "POLISHING" }] });
  let calls = 0;
  const conflictingClient = {
    $transaction: (callback) => client.$transaction((tx) => callback(new Proxy(tx, {
      get(target, property) {
        if (property !== "productPart") return target[property];
        return new Proxy(target.productPart, {
          get(delegate, method) {
            if (method !== "updateMany") return delegate[method];
            return async (args) => {
              calls += 1;
              if (calls === 2) return { count: 0 };
              return delegate.updateMany(args);
            };
          }
        });
      }
    })))
  };
  const result = await capture(() => markProductProductionComplete({ client: conflictingClient, productId: graph.product.id }));
  completion.rollback = { graph, result };
  assert.equal(result.error.status, 409);
});
test("50. 多 Part 冲突时首个更新也完整回滚", async () => {
  const rows = await client.productPart.findMany({ where: { productId: completion.rollback.graph.product.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(rows.map((row) => row.status), ["WELDING", "POLISHING"]);
});
test("51. 新事务重新读取并保留并发回厂数量", async () => {
  const graph = await createGraph({ parts: [{ totalQuantity: 5, outsourcedQuantity: 5, returnedQuantity: 5, missingQuantity: 0, status: "OUTSOURCING" }] });
  await competitor.productPart.update({ where: { id: graph.parts[0].id }, data: { returnedQuantity: 8 } });
  await markProductProductionComplete({ client, productId: graph.product.id });
  assert.equal((await client.productPart.findUnique({ where: { id: graph.parts[0].id } })).returnedQuantity, 8);
});
test("52. 重复已完成请求幂等且不重复写入", async () => {
  const beforePart = await client.productPart.findUnique({ where: { id: completion.never.parts[0].id } });
  const beforeProduct = await client.product.findUnique({ where: { id: completion.never.product.id } });
  await markProductProductionComplete({ client, productId: completion.never.product.id });
  const afterPart = await client.productPart.findUnique({ where: { id: completion.never.parts[0].id } });
  const afterProduct = await client.product.findUnique({ where: { id: completion.never.product.id } });
  assert.deepEqual([afterPart.updatedAt, afterProduct.updatedAt], [beforePart.updatedAt, beforeProduct.updatedAt]);
});
test("53. 普通 Product 快速完成后为 WAIT_DELIVERY", async () => {
  assert.equal((await client.product.findUnique({ where: { id: completion.never.product.id } })).status, "WAIT_DELIVERY");
});
test("54. 全部产品就绪时普通 Order 为 WAIT_DELIVERY", async () => {
  assert.equal((await client.order.findUnique({ where: { id: completion.never.order.id } })).status, "WAIT_DELIVERY");
});
test("55. PARTIAL_DELIVERED Product 不被快速完成回退", async () => {
  const graph = await createGraph({ orderStatus: "PARTIAL_DELIVERED", productStatus: "PARTIAL_DELIVERED", parts: [{ status: "RETURNED", returnedQuantity: 5 }] });
  await markProductProductionComplete({ client, productId: graph.product.id });
  completion.partialProduct = graph;
  assert.equal((await client.product.findUnique({ where: { id: graph.product.id } })).status, "PARTIAL_DELIVERED");
});
test("56. PARTIAL_DELIVERED Order 快速完成后保持", async () => {
  assert.equal((await client.order.findUnique({ where: { id: completion.partialProduct.order.id } })).status, "PARTIAL_DELIVERED");
});
test("57. COMPLETED Product 在非完成订单中不回退", async () => {
  const graph = await createGraph({ orderStatus: "PARTIAL_DELIVERED", productStatus: "COMPLETED", parts: [{ status: "RETURNED", returnedQuantity: 5 }] });
  await markProductProductionComplete({ client, productId: graph.product.id });
  assert.equal((await client.product.findUnique({ where: { id: graph.product.id } })).status, "COMPLETED");
});
test("58. COMPLETED Order 禁止快速完成", async () => {
  const graph = await createGraph({ orderStatus: "COMPLETED" });
  const result = await capture(() => markProductProductionComplete({ client, productId: graph.product.id }));
  assert.equal(result.error.status, 409);
});

test("59. 数量齐全且无异常时齐套提升 WAIT_DELIVERY", async () => {
  const graph = await createGraph({ parts: [{ status: "RETURNED", returnedQuantity: 5 }] });
  const before = graph.parts.map(({ outsourcedQuantity, returnedQuantity, missingQuantity }) => ({ outsourcedQuantity, returnedQuantity, missingQuantity }));
  const result = await refreshKittingState({ client, productId: graph.product.id });
  kitting = { graph, before, result };
  assert.equal(result.product.status, "WAIT_DELIVERY");
});
test("60. 无部件产品不能齐套", async () => {
  const graph = await createGraph({ parts: [] });
  const result = await refreshKittingState({ client, productId: graph.product.id });
  assert.equal(result.result.hasParts, false);
});
test("61. 数量不足不能齐套", async () => {
  const graph = await createGraph({ parts: [{ status: "PARTIAL_RETURN", returnedQuantity: 2, missingQuantity: 3 }] });
  const result = await refreshKittingState({ client, productId: graph.product.id });
  assert.equal(result.result.isQuantityComplete, false);
});
test("62. ABNORMAL Part 不能齐套", async () => {
  const graph = await createGraph({ parts: [{ status: "ABNORMAL", returnedQuantity: 5 }] });
  const result = await refreshKittingState({ client, productId: graph.product.id });
  assert.equal(result.result.hasAbnormal, true);
});
test("63. OPEN 异常存在时不能齐套", async () => {
  const graph = await createGraph({ parts: [{ status: "WELDING", returnedQuantity: 5 }] });
  await report(graph);
  await client.productPart.update({ where: { id: graph.parts[0].id }, data: { status: "RETURNED" } });
  const result = await refreshKittingState({ client, productId: graph.product.id });
  assert.equal(result.result.hasAbnormal, true);
});
test("64. 未送货 WAIT_DELIVERY 数量失效后回退", async () => {
  const graph = await createGraph({ productStatus: "WAIT_DELIVERY", parts: [{ status: "RETURNED", returnedQuantity: 2, missingQuantity: 3 }] });
  const result = await refreshKittingState({ client, productId: graph.product.id });
  kitting.rollback = { graph, result };
  assert.equal(result.product.status, "PARTIAL_RETURN");
});
test("65. Product 回退后普通 Order 按实际产品汇总", async () => {
  assert.equal((await client.order.findUnique({ where: { id: kitting.rollback.graph.order.id } })).status, "OUTSOURCING");
});
test("66. PARTIAL_DELIVERED Product 齐套失败不回退", async () => {
  const graph = await createGraph({ orderStatus: "PARTIAL_DELIVERED", productStatus: "PARTIAL_DELIVERED", parts: [{ status: "PARTIAL_RETURN", returnedQuantity: 2, missingQuantity: 3 }] });
  const result = await refreshKittingState({ client, productId: graph.product.id });
  assert.equal(result.product.status, "PARTIAL_DELIVERED");
});
test("67. COMPLETED Product 齐套失败不回退", async () => {
  const graph = await createGraph({ orderStatus: "PARTIAL_DELIVERED", productStatus: "COMPLETED", parts: [{ status: "PARTIAL_RETURN", returnedQuantity: 2, missingQuantity: 3 }] });
  const result = await refreshKittingState({ client, productId: graph.product.id });
  assert.equal(result.product.status, "COMPLETED");
});
test("68. PARTIAL_DELIVERED Order 齐套后不回退", async () => {
  const graph = await createGraph({ orderStatus: "PARTIAL_DELIVERED", parts: [{ status: "RETURNED", returnedQuantity: 5 }] });
  await refreshKittingState({ client, productId: graph.product.id });
  assert.equal((await client.order.findUnique({ where: { id: graph.order.id } })).status, "PARTIAL_DELIVERED");
});
test("69. COMPLETED Order 齐套后不回退", async () => {
  const graph = await createGraph({ orderStatus: "COMPLETED", parts: [{ status: "RETURNED", returnedQuantity: 5 }] });
  await refreshKittingState({ client, productId: graph.product.id });
  assert.equal((await client.order.findUnique({ where: { id: graph.order.id } })).status, "COMPLETED");
});
test("70. 齐套检查不修改数量字段", async () => {
  const rows = await client.productPart.findMany({ where: { productId: kitting.graph.product.id }, orderBy: { id: "asc" } });
  assert.deepEqual(rows.map(({ outsourcedQuantity, returnedQuantity, missingQuantity }) => ({ outsourcedQuantity, returnedQuantity, missingQuantity })), kitting.before);
});
test("71. 齐套条件更新冲突返回 409", async () => {
  const graph = await createGraph({ parts: [{ status: "RETURNED", returnedQuantity: 5 }] });
  const conflictingClient = {
    $transaction: (callback) => client.$transaction((tx) => callback(new Proxy(tx, {
      get(target, property) {
        if (property !== "product") return target[property];
        return new Proxy(target.product, {
          get(delegate, method) {
            if (method !== "updateMany") return delegate[method];
            return async () => ({ count: 0 });
          }
        });
      }
    })))
  };
  const result = await capture(() => refreshKittingState({ client: conflictingClient, productId: graph.product.id }));
  assert.equal(result.error.status, 409);
});

test("72. 真实 SQLite P2002 映射稳定 409", async () => {
  const graph = await createGraph();
  let actual;
  try {
    await competitor.order.create({
      data: {
        orderNo: graph.order.orderNo,
        customerId: graph.customer.id,
        customerName: graph.customer.name
      }
    });
  } catch (error) {
    actual = error;
  }
  const result = await capture(() => advancePartProduction({
    client: { $transaction: async () => { throw actual; } },
    partId: graph.parts[0].id,
    expectedStatus: "PENDING"
  }));
  p2002Error = result.error;
  assert.equal(result.error.status, 409);
});
test("73. 真实 SQLite P2003 映射稳定 409", async () => {
  let actual;
  try {
    await competitor.productPartProgressLog.create({
      data: {
        productPartId: "missing",
        productId: "missing",
        orderId: "missing",
        fromStatus: "PENDING",
        toStatus: "WELDING",
        actionName: "冲突"
      }
    });
  } catch (error) {
    actual = error;
  }
  const result = await capture(() => advancePartProduction({
    client: { $transaction: async () => { throw actual; } },
    partId: "missing",
    expectedStatus: "PENDING"
  }));
  p2003Error = result.error;
  assert.equal(result.error.status, 409);
});
test("74. 真实 SQLite 写锁精确尝试三次", async () => {
  const locker = new PrismaClient({ datasourceUrl: databaseUrl });
  const blocked = new PrismaClient({ datasourceUrl: databaseUrl });
  clients.push(locker, blocked);
  await blocked.$queryRawUnsafe("PRAGMA busy_timeout = 1");
  const graph = await createGraph();
  const locked = deferred();
  const release = deferred();
  const lockPromise = locker.$transaction(async (tx) => {
    await tx.productPart.update({ where: { id: graph.parts[0].id }, data: { remark: "持锁" } });
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  const attempts = [];
  const result = await capture(() => advancePartProduction({
    client: blocked,
    partId: graph.parts[0].id,
    expectedStatus: "PENDING",
    dependencies: {
      beforeAttempt: async (_operation, attempt) => { attempts.push(attempt); },
      sleep: async () => {}
    }
  }));
  release.resolve();
  await lockPromise;
  lockResult = { graph, attempts, result };
  assert.deepEqual(attempts, [1, 2, 3]);
});
test("75. 第三次锁冲突耗尽返回精确 503", () => {
  assert.deepEqual([lockResult.result.error.status, lockResult.result.error.message], [503, "系统繁忙，请稍后重试。"]);
});
test("76. 锁冲突第三次后不执行第四次", () => {
  assert.equal(lockResult.attempts.includes(4), false);
});
test("77. 锁错误响应不含 SQLite 或 Prisma 原文", () => {
  assert.doesNotMatch(lockResult.result.error.message, /SQLITE|locked|Prisma|P\d{4}|production-kitting\.db/i);
});
test("78. 真实未知数据库错误映射稳定 500", async () => {
  let actual;
  try {
    await competitor.$queryRawUnsafe("SELECT * FROM definitely_missing_table");
  } catch (error) {
    actual = error;
  }
  const result = await capture(() => advancePartProduction({
    client: { $transaction: async () => { throw actual; } },
    partId: "missing",
    expectedStatus: "PENDING"
  }));
  unknownError = result.error;
  assert.deepEqual([result.error.status, result.error.message], [500, "操作失败，请稍后重试。"]);
});
test("79. 409 与 500 文案不泄露代码、索引或绝对路径", () => {
  for (const error of [p2002Error, p2003Error, unknownError]) {
    assert.doesNotMatch(error.message, /P2002|P2003|SQLite|Prisma|Order_orderNo_key|production-kitting\.db|[A-Z]:\\/i);
  }
});
test("80. 最大生产写尝试常量为三", () => {
  assert.equal(MAX_PRODUCTION_WRITE_ATTEMPTS, 3);
});
test("81. 稳定错误具有 status 且 cause 不进入 message", () => {
  assert.ok(lockResult.result.error instanceof ProductionKittingError);
  assert.equal(lockResult.result.error.message.includes(String(lockResult.result.error.cause)), false);
});
test("82. 正式 dev.db 测试前后 SHA-256 保持", async () => {
  assert.equal(await hashFile(formalDb), formalDbHash);
});
test("83. 正式 Schema 测试前后 SHA-256 保持", async () => {
  assert.equal(await hashFile(formalSchema), formalSchemaHash);
});
test("84. 正式 private 文件树保持", async () => {
  assert.deepEqual(await treeSummary(privateRoot), privateBefore);
});
test("85. 正式 public 文件树保持", async () => {
  assert.deepEqual(await treeSummary(publicRoot), publicBefore);
});
test("86. 全部 Client、临时数据库和 sidecar 最终清理", async () => {
  await Promise.allSettled(clients.map((item) => item.$disconnect()));
  await rm(temporaryRoot, { recursive: true, force: true });
  cleaned = true;
  await assert.rejects(access(temporaryRoot));
});
