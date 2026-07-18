import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";

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
  createOutsourceOrderIntegrity,
  isOutsourceNumberConflict,
  isTransientOutsourcingSqliteError,
  MAX_OUTSOURCE_CREATE_ATTEMPTS,
  OutsourcingIntegrityError
} = await import("../src/lib/outsourcing-integrity.ts");

const formalDb = path.join(root, "prisma", "dev.db");
const formalSchema = path.join(root, "prisma", "schema.prisma");
const privateRoot = path.join(root, "storage");
const publicRoot = path.join(root, "public");
const temporaryRoot = path.join(tmpdir(), `jinhong-outsourcing-${process.pid}-${randomUUID()}`);
const databasePath = path.join(temporaryRoot, "outsourcing.db");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
const clients = [];
let client;
let competitor;
let customer;
let sequence = 0;
let formalDbHash;
let formalSchemaHash;
let privateBefore;
let publicBefore;
let cleaned = false;
const results = {};

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

function inputFor(partId, overrides = {}) {
  return {
    supplierName: "测试供应商",
    outsourceType: "ELECTROPLATING",
    outsourceDate: "2035-01-01",
    expectedReturnDate: "",
    handler: "",
    remark: "",
    items: [{ partId, outsourceQuantity: 1, remark: "" }],
    ...overrides
  };
}

async function createGraph({
  database = client,
  orderStatus = "PENDING",
  productStatus = "WAIT_OUTSOURCE",
  parts = [{}]
} = {}) {
  sequence += 1;
  const marker = `${sequence}-${randomUUID()}`;
  const order = await database.order.create({
    data: {
      orderNo: `OUT-TEST-${marker}`,
      customerId: customer.id,
      customerName: customer.name,
      status: orderStatus
    }
  });
  const product = await database.product.create({
    data: {
      orderId: order.id,
      productName: `测试产品-${marker}`,
      quantity: 1,
      status: productStatus
    }
  });
  const createdParts = [];
  for (const [index, data] of parts.entries()) {
    createdParts.push(await database.productPart.create({
      data: {
        orderId: order.id,
        productId: product.id,
        partName: `测试部件-${index}-${marker}`,
        totalQuantity: data.totalQuantity ?? 5,
        unitQuantity: 1,
        productQuantity: data.totalQuantity ?? 5,
        outsourcedQuantity: data.outsourcedQuantity ?? 0,
        returnedQuantity: data.returnedQuantity ?? 0,
        missingQuantity: data.missingQuantity ?? 0,
        status: data.status ?? "WAIT_OUTSOURCE",
        surfaceTreatment: data.surfaceTreatment ?? null,
        color: data.color ?? null
      }
    }));
  }
  return { order, product, parts: createdParts };
}

async function createDrawing(graph, {
  version,
  isMain = false,
  status = "CONFIRMED",
  thumbnailUrl = null,
  printThumbnailUrl = null,
  originalUrl
}) {
  return client.partDrawing.create({
    data: {
      orderId: graph.order.id,
      productId: graph.product.id,
      partId: graph.parts[0].id,
      fileName: `drawing-${version}.png`,
      fileType: "png",
      originalUrl: originalUrl ?? `/snapshot/original-${version}.png`,
      thumbnailUrl,
      printThumbnailUrl,
      version,
      isMain,
      status
    }
  });
}

function knownError(code, meta, message = "集成测试内部错误") {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta
  });
}

function unknownError(message) {
  return new Prisma.PrismaClientUnknownRequestError(message, {
    clientVersion: Prisma.prismaVersion.client
  });
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
  customer = await client.customer.create({
    data: {
      name: "C3f-2 临时测试客户"
    }
  });
});

after(async () => {
  if (!cleaned) {
    await Promise.allSettled(clients.map((item) => item.$disconnect()));
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("001. 临时 SQLite 已执行全部四条 migration", async () => {
  const rows = await client.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL');
  assert.equal(rows.length, 4);
});
test("002. 集成测试使用两个独立 PrismaClient", () => {
  assert.notEqual(client, competitor);
});
test("003. 合法 YYYY-MM-DD 创建成功", async () => {
  const graph = await createGraph();
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id) });
  results.valid = { graph, value };
  assert.equal(value.outsourceNo, "WF20350101001");
});
test("004. 数据库 outsourceDate 保持本地业务日期", async () => {
  assert.equal(results.valid.value.outsourceDate.getFullYear(), 2035);
  assert.equal(results.valid.value.outsourceDate.getMonth(), 0);
  assert.equal(results.valid.value.outsourceDate.getDate(), 1);
});
test("005. 不存在日期 2026-02-31 被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor("unused", { outsourceDate: "2026-02-31" }) }));
  assert.deepEqual([result.error.status, result.error.message], [400, "外发日期格式错误。"]);
});
test("006. 带时间日期被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor("unused", { outsourceDate: "2035-01-01T00:00:00" }) }));
  assert.equal(result.error.status, 400);
});
test("007. 空日期被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor("unused", { outsourceDate: "" }) }));
  assert.equal(result.error.message, "外发日期格式错误。");
});
test("008. 斜杠日期被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor("unused", { outsourceDate: "2035/01/01" }) }));
  assert.equal(result.error.status, 400);
});
test("009. 供应商空值被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor("unused", { supplierName: "   " }) }));
  assert.deepEqual([result.error.status, result.error.message], [400, "供应商不能为空。"]);
});
test("010. 空明细被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor("unused", { items: [] }) }));
  assert.deepEqual([result.error.status, result.error.message], [400, "请至少添加一个外发部件。"]);
});
test("011. 重复 partId 被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor("same-part", {
      items: [
        { partId: "same-part", outsourceQuantity: 1 },
        { partId: "same-part", outsourceQuantity: 1 }
      ]
    })
  }));
  assert.deepEqual([result.error.status, result.error.message], [400, "同一部件不能重复添加。"]);
});
test("012. 空 partId 被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor("", {}) }));
  assert.equal(result.error.message, "外发部件信息无效。");
});
test("013. 带空格 partId 被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor(" part ") }));
  assert.equal(result.error.status, 400);
});
test("014. 正整数 number 通过", async () => {
  const graph = await createGraph();
  const value = await createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-01-02", items: [{ partId: graph.parts[0].id, outsourceQuantity: 1 }] })
  });
  assert.ok(value.id);
});
test("015. 规范正整数字符串通过", async () => {
  const graph = await createGraph();
  const value = await createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-01-03", items: [{ partId: graph.parts[0].id, outsourceQuantity: "1" }] })
  });
  assert.ok(value.id);
});

for (const [number, label, quantity] of [
  [16, "科学计数法字符串", "1e3"],
  [17, "小数", 1.5],
  [18, "零", 0],
  [19, "负数", -1],
  [20, "带空格字符串", " 1 "],
  [21, "带正号字符串", "+1"],
  [22, "前导零字符串", "01"],
  [23, "超过安全整数", Number.MAX_SAFE_INTEGER + 1],
  [24, "超过Prisma Int", 2_147_483_648]
]) {
  test(`${String(number).padStart(3, "0")}. ${label}数量被拒绝`, async () => {
    const result = await capture(() => createOutsourceOrderIntegrity({
      client,
      input: inputFor("unused", { items: [{ partId: "unused", outsourceQuantity: quantity }] })
    }));
    assert.deepEqual([result.error.status, result.error.message], [400, "外发数量必须是大于0的安全整数。"]);
  });
}

test("025. 非法OutsourceType被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor("unused", { outsourceType: "INVALID" }) }));
  assert.deepEqual([result.error.status, result.error.message], [400, "外发类型无效。"]);
});
test("026. 非对象请求体被拒绝", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: null }));
  assert.deepEqual([result.error.status, result.error.message], [400, "请求格式错误。"]);
});
test("027. 当日首号为001", async () => {
  const graph = await createGraph();
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-02-01" }) });
  results.numberFirst = value;
  assert.equal(value.outsourceNo, "WF20350201001");
});
test("028. 同日第二张为002", async () => {
  const graph = await createGraph();
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-02-01" }) });
  assert.equal(value.outsourceNo, "WF20350201002");
});
test("029. 跨日重新从001开始", async () => {
  const graph = await createGraph();
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-02-02" }) });
  assert.equal(value.outsourceNo, "WF20350202001");
});
test("030. 历史流水空缺不补号", async () => {
  await client.outsourceOrder.createMany({
    data: [
      { outsourceNo: "WF20350203001", supplierName: "历史", outsourceType: "OTHER", outsourceDate: new Date(2035, 1, 3), status: "OUTSOURCED" },
      { outsourceNo: "WF20350203003", supplierName: "历史", outsourceType: "OTHER", outsourceDate: new Date(2035, 1, 3), status: "OUTSOURCED" }
    ]
  });
  const graph = await createGraph();
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-02-03" }) });
  assert.equal(value.outsourceNo, "WF20350203004");
});
test("031. 非精确三位历史编号被忽略", async () => {
  await client.outsourceOrder.create({
    data: { outsourceNo: "WF203502041000", supplierName: "历史", outsourceType: "OTHER", outsourceDate: new Date(2035, 1, 4), status: "OUTSOURCED" }
  });
  const graph = await createGraph();
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-02-04" }) });
  assert.equal(value.outsourceNo, "WF20350204001");
});
test("032. 编号日期与outsourceDate一致", () => {
  assert.equal(results.numberFirst.outsourceNo.slice(2, 10), "20350201");
});
test("033. 最大999后稳定409", async () => {
  await client.outsourceOrder.create({
    data: { outsourceNo: "WF20350205999", supplierName: "历史", outsourceType: "OTHER", outsourceDate: new Date(2035, 1, 5), status: "OUTSOURCED" }
  });
  const graph = await createGraph();
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-02-05" }) }));
  assert.deepEqual([result.error.status, result.error.message], [409, "当日外发单数量已达到上限。"]);
});
test("034. 最大999后不创建第1000张", async () => {
  assert.equal(await client.outsourceOrder.count({ where: { outsourceNo: "WF203502051000" } }), 0);
});
test("035. 编号冲突一次后第二次成功", async () => {
  const graph = await createGraph();
  const attempts = [];
  const value = await createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-02-06" }),
    dependencies: {
      beforeTransactionAttempt: async (attempt) => attempts.push(attempt),
      afterNumberAllocated: async ({ tx, attempt, outsourceNo }) => {
        if (attempt === 1) {
          await tx.outsourceOrder.create({
            data: { outsourceNo, supplierName: "冲突", outsourceType: "OTHER", outsourceDate: new Date(2035, 1, 6), status: "OUTSOURCED" }
          });
        }
      },
      sleep: async () => {}
    }
  });
  results.oneNumberConflict = { attempts, value };
  assert.ok(value.id);
});
test("036. 一次编号冲突执行两次完整事务", () => {
  assert.deepEqual(results.oneNumberConflict.attempts, [1, 2]);
});
test("037. 一次编号冲突后重新分配成功编号", () => {
  assert.equal(results.oneNumberConflict.value.outsourceNo, "WF20350206001");
});
test("038. 两次编号冲突第三次成功", async () => {
  const graph = await createGraph();
  const attempts = [];
  const value = await createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-02-07" }),
    dependencies: {
      beforeTransactionAttempt: async (attempt) => attempts.push(attempt),
      afterNumberAllocated: async ({ tx, attempt, outsourceNo }) => {
        if (attempt <= 2) {
          await tx.outsourceOrder.create({
            data: { outsourceNo, supplierName: "冲突", outsourceType: "OTHER", outsourceDate: new Date(2035, 1, 7), status: "OUTSOURCED" }
          });
        }
      },
      sleep: async () => {}
    }
  });
  results.twoNumberConflicts = { attempts, value };
  assert.ok(value.id);
});
test("039. 两次编号冲突执行三次事务", () => {
  assert.deepEqual(results.twoNumberConflicts.attempts, [1, 2, 3]);
});
test("040. 三次编号冲突耗尽返回稳定409", async () => {
  const graph = await createGraph();
  const attempts = [];
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-02-08" }),
    dependencies: {
      beforeTransactionAttempt: async (attempt) => attempts.push(attempt),
      afterNumberAllocated: async ({ tx, outsourceNo }) => {
        await tx.outsourceOrder.create({
          data: { outsourceNo, supplierName: "冲突", outsourceType: "OTHER", outsourceDate: new Date(2035, 1, 8), status: "OUTSOURCED" }
        });
      },
      sleep: async () => {}
    }
  }));
  results.numberExhausted = { attempts, result };
  assert.deepEqual([result.error.status, result.error.message], [409, "外发单编号冲突，请重新提交。"]);
});
test("041. 三次编号冲突不执行第四次", () => {
  assert.deepEqual(results.numberExhausted.attempts, [1, 2, 3]);
});
test("042. 编号冲突由真实数据库唯一约束产生", () => {
  assert.equal(results.numberExhausted.result.error.cause.code, "P2002");
});
test("043. 精确outsourceNo P2002识别成功", () => {
  assert.equal(isOutsourceNumberConflict(results.numberExhausted.result.error.cause), true);
});
test("044. 其他字段P2002不按编号重试", async () => {
  const graph = await createGraph();
  const drawing = await createDrawing(graph, { version: 1 });
  const attempts = [];
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-02-09" }),
    dependencies: {
      beforeTransactionAttempt: async (attempt) => attempts.push(attempt),
      afterSnapshotsValidated: async ({ tx }) => {
        await tx.partDrawing.create({
          data: {
            orderId: graph.order.id,
            productId: graph.product.id,
            partId: graph.parts[0].id,
            fileName: "duplicate.png",
            originalUrl: "/duplicate.png",
            version: drawing.version
          }
        });
      }
    }
  }));
  results.otherP2002 = { attempts, result };
  assert.deepEqual([result.error.status, result.error.message], [409, "数据发生唯一性冲突，请刷新后重试。"]);
});
test("045. 其他P2002只执行一次事务", () => {
  assert.deepEqual(results.otherP2002.attempts, [1]);
});
test("046. 允许WAIT_OUTSOURCE来源", async () => {
  const graph = await createGraph();
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-01" }) });
  assert.ok(value.id);
});
test("047. 允许OUTSOURCING追加剩余量", async () => {
  const graph = await createGraph({ productStatus: "OUTSOURCING", parts: [{ status: "OUTSOURCING", totalQuantity: 5, outsourcedQuantity: 2, missingQuantity: 2 }] });
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-02" }) });
  assert.ok(value.id);
});
test("048. 允许PARTIAL_RETURN追加剩余量", async () => {
  const graph = await createGraph({ productStatus: "PARTIAL_RETURN", parts: [{ status: "PARTIAL_RETURN", totalQuantity: 5, outsourcedQuantity: 3, returnedQuantity: 1, missingQuantity: 2 }] });
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-03" }) });
  assert.ok(value.id);
});
test("049. 合法RETURNED部分外发回齐后允许剩余量", async () => {
  const graph = await createGraph({ productStatus: "WAIT_DELIVERY", parts: [{ status: "RETURNED", totalQuantity: 5, outsourcedQuantity: 2, returnedQuantity: 2, missingQuantity: 0 }] });
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-04" }) });
  results.returnedRemaining = { graph, value };
  assert.ok(value.id);
});
test("050. RETURNED继续外发后Part进入OUTSOURCING", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.returnedRemaining.graph.parts[0].id } });
  assert.equal(part.status, "OUTSOURCING");
});
test("051. 快速完成RETURNED禁止外发", async () => {
  const graph = await createGraph({ productStatus: "WAIT_DELIVERY", parts: [{ status: "RETURNED", totalQuantity: 5, outsourcedQuantity: 0, returnedQuantity: 5, missingQuantity: 0 }] });
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-05" }) }));
  assert.deepEqual([result.error.status, result.error.message], [409, "当前部件状态不允许外发。"]);
});

for (const [number, status] of [
  [52, "PENDING"],
  [53, "CUTTING"],
  [54, "WELDING"],
  [55, "POLISHING"],
  [56, "ABNORMAL"]
]) {
  test(`${String(number).padStart(3, "0")}. ${status}部件禁止外发`, async () => {
    const graph = await createGraph({ productStatus: status === "ABNORMAL" ? "ABNORMAL" : status, parts: [{ status }] });
    const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: `2035-03-${String(number - 45).padStart(2, "0")}` }) }));
    assert.equal(result.error.status, 409);
  });
}

test("057. Product PARTIAL_DELIVERED禁止外发", async () => {
  const graph = await createGraph({ productStatus: "PARTIAL_DELIVERED" });
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-12" }) }));
  assert.equal(result.error.message, "当前产品状态不允许外发。");
});
test("058. Product COMPLETED禁止外发", async () => {
  const graph = await createGraph({ productStatus: "COMPLETED" });
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-13" }) }));
  assert.equal(result.error.status, 409);
});
test("059. Product ABNORMAL禁止外发", async () => {
  const graph = await createGraph({ productStatus: "ABNORMAL" });
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-14" }) }));
  assert.equal(result.error.message, "当前产品状态不允许外发。");
});
test("060. PARTIAL_DELIVERED订单允许合法未送货Product外发", async () => {
  const graph = await createGraph({ orderStatus: "PARTIAL_DELIVERED" });
  const value = await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-15" }) });
  results.partialOrder = { graph, value };
  assert.ok(value.id);
});
test("061. PARTIAL_DELIVERED订单外发后保持原状态", async () => {
  const order = await client.order.findUnique({ where: { id: results.partialOrder.graph.order.id } });
  assert.equal(order.status, "PARTIAL_DELIVERED");
});
test("062. COMPLETED订单禁止外发", async () => {
  const graph = await createGraph({ orderStatus: "COMPLETED" });
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-16" }) }));
  assert.equal(result.error.message, "当前订单状态不允许外发。");
});
test("063. ABNORMAL订单禁止外发", async () => {
  const graph = await createGraph({ orderStatus: "ABNORMAL" });
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-17" }) }));
  assert.equal(result.error.status, 409);
});
test("064. WAIT_DELIVERY Product有合法余量时允许外发", async () => {
  const graph = await createGraph({ orderStatus: "WAIT_DELIVERY", productStatus: "WAIT_DELIVERY", parts: [{ status: "RETURNED", totalQuantity: 5, outsourcedQuantity: 2, returnedQuantity: 2, missingQuantity: 0 }] });
  await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-03-18" }) });
  results.waitDelivery = graph;
  const product = await client.product.findUnique({ where: { id: graph.product.id } });
  assert.equal(product.status, "OUTSOURCING");
});
test("065. 普通WAIT_DELIVERY订单重新汇总为OUTSOURCING", async () => {
  const order = await client.order.findUnique({ where: { id: results.waitDelivery.order.id } });
  assert.equal(order.status, "OUTSOURCING");
});
test("066. 部分数量外发成功", async () => {
  const graph = await createGraph({ parts: [{ totalQuantity: 10 }] });
  const value = await createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-01", items: [{ partId: graph.parts[0].id, outsourceQuantity: 3 }] })
  });
  results.partialQuantity = { graph, value };
  assert.ok(value.id);
});
test("067. outsourcedQuantity按请求量increment", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.partialQuantity.graph.parts[0].id } });
  assert.equal(part.outsourcedQuantity, 3);
});
test("068. missingQuantity按请求量increment", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.partialQuantity.graph.parts[0].id } });
  assert.equal(part.missingQuantity, 3);
});
test("069. returnedQuantity在外发时保持不变", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.partialQuantity.graph.parts[0].id } });
  assert.equal(part.returnedQuantity, 0);
});
test("070. totalQuantity在外发时保持不变", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.partialQuantity.graph.parts[0].id } });
  assert.equal(part.totalQuantity, 10);
});
test("071. 请求超过total-outsourced稳定409", async () => {
  const graph = await createGraph({ productStatus: "OUTSOURCING", parts: [{ status: "OUTSOURCING", totalQuantity: 5, outsourcedQuantity: 4, missingQuantity: 4 }] });
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-02", items: [{ partId: graph.parts[0].id, outsourceQuantity: 2 }] })
  }));
  assert.deepEqual([result.error.status, result.error.message], [409, "可外发数量已变化，请刷新后重试。"]);
});
test("072. 回厂后不恢复已使用外发额度", async () => {
  const graph = await createGraph({ productStatus: "WAIT_DELIVERY", parts: [{ status: "RETURNED", totalQuantity: 5, outsourcedQuantity: 4, returnedQuantity: 4, missingQuantity: 0 }] });
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-03", items: [{ partId: graph.parts[0].id, outsourceQuantity: 2 }] })
  }));
  assert.equal(result.error.status, 409);
});
test("073. 同一Part可在两张合法单累计外发", async () => {
  const graph = await createGraph({ parts: [{ totalQuantity: 5 }] });
  await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-04", items: [{ partId: graph.parts[0].id, outsourceQuantity: 2 }] }) });
  await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-04", items: [{ partId: graph.parts[0].id, outsourceQuantity: 2 }] }) });
  results.twoLegalOrders = graph;
  assert.equal(await client.outsourceOrderItem.count({ where: { partId: graph.parts[0].id } }), 2);
});
test("074. 两张合法单累计不超过total", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.twoLegalOrders.parts[0].id } });
  assert.equal(part.outsourcedQuantity, 4);
});
test("075. 相同内容重复请求有余量时生成两张单", async () => {
  const ids = await client.outsourceOrderItem.findMany({ where: { partId: results.twoLegalOrders.parts[0].id }, select: { outsourceOrderId: true } });
  assert.equal(new Set(ids.map((item) => item.outsourceOrderId)).size, 2);
});
test("076. 第三张超过剩余量稳定409", async () => {
  const graph = results.twoLegalOrders;
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-04", items: [{ partId: graph.parts[0].id, outsourceQuantity: 2 }] }) }));
  assert.equal(result.error.status, 409);
});
test("077. 多明细任一超限时整单回滚", async () => {
  const graph = await createGraph({ parts: [{ totalQuantity: 5 }, { totalQuantity: 1 }] });
  const before = await client.outsourceOrder.count();
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, {
      outsourceDate: "2035-04-05",
      items: [
        { partId: graph.parts[0].id, outsourceQuantity: 1 },
        { partId: graph.parts[1].id, outsourceQuantity: 2 }
      ]
    })
  }));
  results.multiLimit = { graph, before, result };
  assert.equal(result.error.status, 409);
});
test("078. 多明细失败不留下OutsourceOrder", async () => {
  assert.equal(await client.outsourceOrder.count(), results.multiLimit.before);
});
test("079. 多明细失败不留下OutsourceOrderItem", async () => {
  assert.equal(await client.outsourceOrderItem.count({ where: { partId: { in: results.multiLimit.graph.parts.map((part) => part.id) } } }), 0);
});
test("080. 多明细失败不修改先验证的Part", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.multiLimit.graph.parts[0].id } });
  assert.equal(part.outsourcedQuantity, 0);
});
test("081. 条件updateMany状态快照变化时409", async () => {
  const graph = await createGraph();
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-06" }),
    dependencies: {
      beforePartConditionalUpdate: async ({ tx, partId }) => {
        await tx.productPart.update({ where: { id: partId }, data: { status: "ABNORMAL" } });
      }
    }
  }));
  results.partStateConflict = { graph, result };
  assert.equal(result.error.status, 409);
});
test("082. Part状态冲突时整单回滚", async () => {
  assert.equal(await client.outsourceOrderItem.count({ where: { partId: results.partStateConflict.graph.parts[0].id } }), 0);
});
test("083. returnedQuantity快照变化时不被覆盖", async () => {
  const graph = await createGraph({ productStatus: "OUTSOURCING", parts: [{ status: "OUTSOURCING", totalQuantity: 5, outsourcedQuantity: 2, missingQuantity: 2 }] });
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-07" }),
    dependencies: {
      beforePartConditionalUpdate: async ({ tx, partId }) => {
        await tx.productPart.update({ where: { id: partId }, data: { returnedQuantity: 1, missingQuantity: 1, status: "PARTIAL_RETURN" } });
      }
    }
  }));
  results.returnSnapshotConflict = { graph, result };
  assert.equal(result.error.status, 409);
});
test("084. returnedQuantity冲突事务回滚到原真实值", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.returnSnapshotConflict.graph.parts[0].id } });
  assert.deepEqual([part.returnedQuantity, part.missingQuantity], [0, 2]);
});
test("085. 任一Part条件冲突使其他Part更新回滚", async () => {
  const graph = await createGraph({ parts: [{}, {}] });
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, {
      outsourceDate: "2035-04-08",
      items: graph.parts.map((part) => ({ partId: part.id, outsourceQuantity: 1 }))
    }),
    dependencies: {
      beforePartConditionalUpdate: async ({ tx, partId }) => {
        if (partId === graph.parts[1].id) {
          await tx.productPart.update({ where: { id: partId }, data: { status: "ABNORMAL" } });
        }
      }
    }
  }));
  results.multiPartConflict = { graph, result };
  assert.equal(result.error.status, 409);
});
test("086. 第二Part冲突时第一Part增量完整回滚", async () => {
  const first = await client.productPart.findUnique({ where: { id: results.multiPartConflict.graph.parts[0].id } });
  assert.deepEqual([first.outsourcedQuantity, first.missingQuantity, first.status], [0, 0, "WAIT_OUTSOURCE"]);
});
test("087. 第二Part冲突不产生半张外发单", async () => {
  assert.equal(await client.outsourceOrderItem.count({ where: { partId: { in: results.multiPartConflict.graph.parts.map((part) => part.id) } } }), 0);
});
test("088. 两个Client并发超发时最多一个提交", async () => {
  const graph = await createGraph({ parts: [{ totalQuantity: 10 }] });
  const gate = deferred();
  let arrivals = 0;
  const dependencies = {
    beforeTransactionAttempt: async (attempt) => {
      if (attempt !== 1) return;
      arrivals += 1;
      if (arrivals === 2) gate.resolve();
      await gate.promise;
    },
    sleep: async () => {}
  };
  const [left, right] = await Promise.all([
    capture(() => createOutsourceOrderIntegrity({
      client,
      input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-09", items: [{ partId: graph.parts[0].id, outsourceQuantity: 6 }] }),
      dependencies
    })),
    capture(() => createOutsourceOrderIntegrity({
      client: competitor,
      input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-09", items: [{ partId: graph.parts[0].id, outsourceQuantity: 6 }] }),
      dependencies
    }))
  ]);
  results.concurrent = { graph, left, right };
  assert.equal([left, right].filter((item) => item.value).length, 1);
});
test("089. 并发超发后另一个请求稳定失败", () => {
  const failure = [results.concurrent.left, results.concurrent.right].find((item) => item.error);
  assert.ok([409, 503].includes(failure.error.status));
});
test("090. 并发最终outsourcedQuantity等于已提交明细合计", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.concurrent.graph.parts[0].id } });
  const aggregate = await client.outsourceOrderItem.aggregate({ where: { partId: part.id }, _sum: { outsourceQuantity: true } });
  assert.equal(part.outsourcedQuantity, aggregate._sum.outsourceQuantity);
});
test("091. 并发最终missingQuantity正确", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.concurrent.graph.parts[0].id } });
  assert.equal(part.missingQuantity, 6);
});
test("092. 并发没有丢失更新", async () => {
  const items = await client.outsourceOrderItem.findMany({ where: { partId: results.concurrent.graph.parts[0].id } });
  assert.equal(items.reduce((sum, item) => sum + item.outsourceQuantity, 0), 6);
});
test("093. Part外发后状态为OUTSOURCING", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.partialQuantity.graph.parts[0].id } });
  assert.equal(part.status, "OUTSOURCING");
});
test("094. 普通Product按最新Parts汇总", async () => {
  const product = await client.product.findUnique({ where: { id: results.partialQuantity.graph.product.id } });
  assert.equal(product.status, "OUTSOURCING");
});
test("095. 普通Order按最新Products汇总", async () => {
  const order = await client.order.findUnique({ where: { id: results.partialQuantity.graph.order.id } });
  assert.equal(order.status, "OUTSOURCING");
});
test("096. Product状态快照变化返回409", async () => {
  const graph = await createGraph();
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-10" }),
    dependencies: {
      afterSnapshotsValidated: async ({ tx }) => {
        await tx.product.update({ where: { id: graph.product.id }, data: { status: "POLISHING" } });
      }
    }
  }));
  results.productConflict = { graph, result };
  assert.equal(result.error.status, 409);
});
test("097. Product状态冲突回滚整张外发单", async () => {
  assert.equal(await client.outsourceOrderItem.count({ where: { partId: results.productConflict.graph.parts[0].id } }), 0);
});
test("098. Order状态快照变化返回409", async () => {
  const graph = await createGraph();
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-04-11" }),
    dependencies: {
      afterSnapshotsValidated: async ({ tx }) => {
        await tx.order.update({ where: { id: graph.order.id }, data: { status: "PRODUCING" } });
      }
    }
  }));
  results.orderConflict = { graph, result };
  assert.equal(result.error.status, 409);
});
test("099. Order状态冲突回滚Part数量", async () => {
  const part = await client.productPart.findUnique({ where: { id: results.orderConflict.graph.parts[0].id } });
  assert.equal(part.outsourcedQuantity, 0);
});
test("100. 初始Part缺失稳定404", async () => {
  const result = await capture(() => createOutsourceOrderIntegrity({ client, input: inputFor("missing-part", { outsourceDate: "2035-05-01" }) }));
  assert.deepEqual([result.error.status, result.error.message], [404, "部分外发部件不存在，请刷新后重试。"]);
});
test("101. CONFIRMED且isMain图纸优先", async () => {
  const graph = await createGraph();
  await createDrawing(graph, { version: 1, isMain: false, status: "CONFIRMED", originalUrl: "/normal.png" });
  const main = await createDrawing(graph, { version: 2, isMain: true, status: "CONFIRMED", thumbnailUrl: "/main-thumb.png", originalUrl: "/main.png" });
  await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-05-02" }) });
  const item = await client.outsourceOrderItem.findFirst({ where: { partId: graph.parts[0].id } });
  results.confirmedMain = { graph, main, item };
  assert.equal(item.drawingId, main.id);
});
test("102. thumbnailUrl快照保存", () => {
  assert.equal(results.confirmedMain.item.thumbnailUrl, "/main-thumb.png");
});
test("103. originalUrl快照保存", () => {
  assert.equal(results.confirmedMain.item.originalUrl, "/main.png");
});
test("104. 无确认主图时isMain优先", async () => {
  const graph = await createGraph();
  const main = await createDrawing(graph, { version: 1, isMain: true, status: "PENDING" });
  await createDrawing(graph, { version: 2, isMain: false, status: "CONFIRMED" });
  await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-05-03" }) });
  const item = await client.outsourceOrderItem.findFirst({ where: { partId: graph.parts[0].id } });
  assert.equal(item.drawingId, main.id);
});
test("105. 无主图时最新非OBSOLETE优先", async () => {
  const graph = await createGraph();
  await createDrawing(graph, { version: 1, status: "CONFIRMED" });
  const latest = await createDrawing(graph, { version: 2, status: "PENDING" });
  await createDrawing(graph, { version: 3, status: "OBSOLETE" });
  await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-05-04" }) });
  const item = await client.outsourceOrderItem.findFirst({ where: { partId: graph.parts[0].id } });
  assert.equal(item.drawingId, latest.id);
});
test("106. 无图时允许创建", async () => {
  const graph = await createGraph();
  await createOutsourceOrderIntegrity({ client, input: inputFor(graph.parts[0].id, { outsourceDate: "2035-05-05" }) });
  const item = await client.outsourceOrderItem.findFirst({ where: { partId: graph.parts[0].id } });
  results.noDrawing = item;
  assert.equal(item.drawingId, null);
});
test("107. 无图时URL快照均为空", () => {
  assert.deepEqual([results.noDrawing.thumbnailUrl, results.noDrawing.originalUrl], [null, null]);
});
test("108. 图纸关联删除真实P2003稳定409", async () => {
  const graph = await createGraph();
  const drawing = await createDrawing(graph, { version: 1, isMain: true });
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-05-06" }),
    dependencies: {
      afterSnapshotsValidated: async ({ tx }) => {
        await tx.partDrawing.delete({ where: { id: drawing.id } });
      }
    }
  }));
  results.p2003 = result;
  assert.deepEqual([result.error.status, result.error.message], [409, "关联数据已变化，请刷新后重试。"]);
});
test("109. 图纸P2003不进入重试", () => {
  assert.equal(results.p2003.error.cause.code, "P2003");
});
test("110. 真实P2025稳定409", async () => {
  const graph = await createGraph();
  const attempts = [];
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-05-07" }),
    dependencies: {
      beforeTransactionAttempt: async (attempt) => attempts.push(attempt),
      afterSnapshotsValidated: async ({ tx }) => {
        await tx.product.update({ where: { id: "missing-product" }, data: { status: "PENDING" } });
      }
    }
  }));
  results.p2025 = { attempts, result };
  assert.deepEqual([result.error.status, result.error.message], [409, "数据状态已变化，请刷新后重试。"]);
});
test("111. P2025不进入锁重试", () => {
  assert.deepEqual(results.p2025.attempts, [1]);
});
test("112. 真实SQLite写锁最多尝试三次", async () => {
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
  const result = await capture(() => createOutsourceOrderIntegrity({
    client: blocked,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-05-08" }),
    dependencies: {
      beforeTransactionAttempt: async (attempt) => attempts.push(attempt),
      sleep: async () => {}
    }
  }));
  release.resolve();
  await lockPromise;
  results.lock = { attempts, result };
  assert.deepEqual(attempts, [1, 2, 3]);
});
test("113. 锁耗尽返回精确503文案", () => {
  assert.deepEqual([results.lock.result.error.status, results.lock.result.error.message], [503, "系统繁忙，请稍后重试。"]);
});
test("114. 第三次锁失败后不执行第四次", () => {
  assert.equal(results.lock.attempts.includes(4), false);
});
test("115. P1008只有精确socket-timeout特征才重试", () => {
  const matching = knownError("P1008", undefined, "Socket timeout (the database failed to respond to a query within the configured timeout)");
  const unrelated = knownError("P1008", undefined, "Authentication failed for file:C:/secret/dev.db");
  assert.equal(isTransientOutsourcingSqliteError(matching), true);
  assert.equal(isTransientOutsourcingSqliteError(unrelated), false);
});
test("116. Unknown busy和locked被严格识别", () => {
  assert.equal(isTransientOutsourcingSqliteError(unknownError("SQLITE_BUSY: database is locked")), true);
  assert.equal(isTransientOutsourcingSqliteError(unknownError("database file is missing")), false);
});
test("117. 未知错误稳定500且不泄露内部文本", async () => {
  const graph = await createGraph();
  const result = await capture(() => createOutsourceOrderIntegrity({
    client,
    input: inputFor(graph.parts[0].id, { outsourceDate: "2035-05-09" }),
    dependencies: {
      afterNumberAllocated: async () => {
        throw new Error(`secret ${databasePath} SQLITE_CORRUPT P9999`);
      }
    }
  }));
  results.unknown = result;
  assert.deepEqual([result.error.status, result.error.message], [500, "创建外发单失败，请稍后重试。"]);
});
test("118. 稳定错误文案不含Prisma、SQLite、索引或绝对路径", () => {
  for (const error of [
    results.numberExhausted.result.error,
    results.otherP2002.result.error,
    results.p2003.error,
    results.p2025.result.error,
    results.lock.result.error,
    results.unknown.error
  ]) {
    assert.doesNotMatch(error.message, /P\d{4}|Prisma|SQLite|locked|outsourceNo|outsourcing\.db|[A-Z]:\\/i);
  }
});
test("119. 最大尝试常量精确为3", () => {
  assert.equal(MAX_OUTSOURCE_CREATE_ATTEMPTS, 3);
});
test("120. 稳定错误具有status且cause不进入message", () => {
  assert.ok(results.unknown.error instanceof OutsourcingIntegrityError);
  assert.equal(results.unknown.error.message.includes(String(results.unknown.error.cause)), false);
});
test("121. 正式dev.db测试前后SHA保持", async () => {
  assert.equal(await hashFile(formalDb), formalDbHash);
});
test("122. 正式Schema测试前后SHA保持", async () => {
  assert.equal(await hashFile(formalSchema), formalSchemaHash);
});
test("123. 正式private文件树保持", async () => {
  assert.deepEqual(await treeSummary(privateRoot), privateBefore);
});
test("124. 正式public文件树保持", async () => {
  assert.deepEqual(await treeSummary(publicRoot), publicBefore);
});
test("125. 全部Client、临时数据库和sidecar及目录最终清理", async () => {
  const disconnects = await Promise.allSettled(clients.map((item) => item.$disconnect()));
  assert.equal(disconnects.filter((result) => result.status === "rejected").length, 0);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    await rm(`${databasePath}${suffix}`, { force: true });
  }
  await rm(temporaryRoot, { recursive: true, force: true });
  cleaned = true;
  await assert.rejects(access(temporaryRoot), (error) => error?.code === "ENOENT");
});
