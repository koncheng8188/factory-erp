import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  createOrderWithGeneratedNo,
  generateOrderNo,
  OrderDailySequenceLimitError,
  OrderNumberConflictError
} from "../src/lib/orders.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const formalDatabasePath = path.join(root, "prisma", "dev.db");
const temporaryRoot = path.join(tmpdir(), `jinhong-erp-c3b2b-${process.pid}-${randomUUID()}`);
const temporaryDatabasePath = path.join(temporaryRoot, "test.db");
const temporaryDatabaseUrl = `file:${temporaryDatabasePath.replaceAll("\\", "/")}`;
const clients = [];
let client;
let customer;

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex").toUpperCase();
}

const formalDatabaseHashBefore = await sha256(formalDatabasePath);
await mkdir(temporaryRoot, { recursive: false });

async function disconnectClients() {
  const results = await Promise.allSettled(clients.map((item) => item.$disconnect()));
  const failures = results.filter((result) => result.status === "rejected");
  assert.equal(failures.length, 0, `PrismaClient 断开失败：${failures.map((failure) => failure.reason).join("；")}`);
}

async function removeTemporaryDatabase() {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    await rm(`${temporaryDatabasePath}${suffix}`, { force: true });
  }
  await rm(temporaryRoot, { recursive: true, force: true });
  await assert.rejects(access(temporaryRoot), (error) => error?.code === "ENOENT");
}

after(async () => {
  try {
    await disconnectClients();
    assert.equal(await sha256(formalDatabasePath), formalDatabaseHashBefore, "正式 dev.db SHA-256 发生变化");
  } finally {
    await removeTemporaryDatabase();
  }
});

before(async () => {
  await writeFile(temporaryDatabasePath, "");
  const command = process.platform === "win32"
    ? "npx.cmd prisma migrate deploy --schema prisma/schema.prisma"
    : "npx prisma migrate deploy --schema prisma/schema.prisma";
  const migration = spawnSync(command, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: temporaryDatabaseUrl },
    shell: true
  });

  assert.ifError(migration.error);
  assert.equal(migration.status, 0, `临时数据库迁移失败：\n${migration.stdout}\n${migration.stderr}`);

  client = new PrismaClient({ datasourceUrl: temporaryDatabaseUrl });
  clients.push(client);
  customer = await client.customer.create({
    data: { name: "C3b-2b1 临时集成测试客户" }
  });
});

function localDate(year, month, day) {
  return new Date(year, month - 1, day);
}

function prefixFor(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `DD${year}${month}${day}`;
}

async function insertOrder(orderNo, orderDate) {
  return client.order.create({
    data: {
      orderNo,
      customerId: customer.id,
      customerName: customer.name,
      orderDate,
      status: "PENDING"
    }
  });
}

async function createOrderGraph(database, label) {
  const order = await database.order.create({
    data: {
      orderNo: `C3B2B2-${label}-${randomUUID()}`,
      customerId: customer.id,
      customerName: customer.name,
      status: "PENDING"
    }
  });
  const product = await database.product.create({
    data: {
      orderId: order.id,
      productName: `${label} 产品`
    }
  });
  const part = await database.productPart.create({
    data: {
      orderId: order.id,
      productId: product.id,
      partName: `${label} 部件`
    }
  });
  return { order, product, part };
}

function deleteOrderGraph(database, orderId) {
  return database.$transaction([
    database.productPart.deleteMany({ where: { orderId } }),
    database.product.deleteMany({ where: { orderId } }),
    database.order.delete({ where: { id: orderId } })
  ]);
}

function restrictedBusinessRecordCounts(database, orderId) {
  return Promise.all([
    database.partDrawing.count({ where: { orderId } }),
    database.productPartProgressLog.count({ where: { orderId } }),
    database.productPartAbnormal.count({ where: { orderId } }),
    database.outsourceOrder.count({ where: { items: { some: { orderId } } } }),
    database.outsourceOrderItem.count({ where: { orderId } }),
    database.outsourceReturnItem.count({ where: { outsourceOrderItem: { orderId } } }),
    database.deliveryOrder.count({ where: { orderId } }),
    database.deliveryOrderItem.count({ where: { orderId } }),
    database.productPart.count({
      where: {
        orderId,
        OR: [{ outsourcedQuantity: { gt: 0 } }, { returnedQuantity: { gt: 0 } }, { missingQuantity: { gt: 0 } }]
      }
    })
  ]);
}

function generatedInput(orderDate) {
  return {
    customerId: customer?.id ?? "mock-customer",
    customerName: customer?.name ?? "模拟客户",
    orderDate,
    deliveryDate: null,
    remark: null
  };
}

function knownRequestError(code, meta) {
  return new Prisma.PrismaClientKnownRequestError("集成测试错误", {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta
  });
}

test("无历史编号时生成 001", async () => {
  const date = localDate(2031, 1, 1);
  assert.equal(await generateOrderNo(date, client), `${prefixFor(date)}001`);
});

test("已有 001 时生成 002", async () => {
  const date = localDate(2031, 1, 2);
  const prefix = prefixFor(date);
  await insertOrder(`${prefix}001`, date);
  assert.equal(await generateOrderNo(date, client), `${prefix}002`);
});

test("000、非数字、两位和四位历史流水均被忽略", async () => {
  const date = localDate(2031, 1, 3);
  const prefix = prefixFor(date);
  await insertOrder(`${prefix}000`, date);
  await insertOrder(`${prefix}AA1`, date);
  await insertOrder(`${prefix}01`, date);
  await insertOrder(`${prefix}1000`, date);
  assert.equal(await generateOrderNo(date, client), `${prefix}001`);
});

test("reservedOrderNos 参与最大流水计算", async () => {
  const date = localDate(2031, 1, 4);
  const prefix = prefixFor(date);
  const reserved = new Set([`${prefix}001`, `${prefix}004`, "JH2612"]);
  assert.equal(await generateOrderNo(date, client, reserved), `${prefix}005`);
  assert.equal(reserved.has(`${prefix}005`), true);
});

test("最大流水 998 时生成 999", async () => {
  const date = localDate(2031, 1, 5);
  const prefix = prefixFor(date);
  await insertOrder(`${prefix}998`, date);
  assert.equal(await generateOrderNo(date, client), `${prefix}999`);
});

test("最大流水 999 时抛出稳定上限错误", async () => {
  const date = localDate(2031, 1, 6);
  const prefix = prefixFor(date);
  await insertOrder(`${prefix}999`, date);
  await assert.rejects(
    generateOrderNo(date, client),
    (error) => error instanceof OrderDailySequenceLimitError && error.message === "当日订单编号已达 999 上限，无法新增订单。"
  );
});

test("orderNo 数组 target 的首次 P2002 会重新编号并在第二次成功", async () => {
  const date = localDate(2032, 1, 1);
  const prefix = prefixFor(date);
  let queryCount = 0;
  const candidates = [];
  const fakeClient = {
    order: {
      findMany: async () => queryCount++ === 0 ? [] : [{ orderNo: `${prefix}001` }],
      create: async ({ data }) => {
        candidates.push(data.orderNo);
        if (candidates.length === 1) {
          throw knownRequestError("P2002", { modelName: "Order", target: ["orderNo"] });
        }
        return { id: "mock-order", ...data };
      }
    }
  };

  const order = await createOrderWithGeneratedNo(fakeClient, generatedInput(date));
  assert.deepEqual(candidates, [`${prefix}001`, `${prefix}002`]);
  assert.equal(order.orderNo, `${prefix}002`);
  assert.equal(order.status, "PENDING");
});

test("orderNo 字符串 target 同样允许重试", async () => {
  const date = localDate(2032, 1, 2);
  let createCount = 0;
  const fakeClient = {
    order: {
      findMany: async () => [],
      create: async ({ data }) => {
        createCount += 1;
        if (createCount === 1) throw knownRequestError("P2002", { target: "orderNo" });
        return { id: "mock-order", ...data };
      }
    }
  };

  await createOrderWithGeneratedNo(fakeClient, generatedInput(date));
  assert.equal(createCount, 2);
});

test("连续三次 orderNo P2002 后抛出稳定冲突错误", async () => {
  const date = localDate(2032, 1, 3);
  let createCount = 0;
  const fakeClient = {
    order: {
      findMany: async () => [],
      create: async () => {
        createCount += 1;
        throw knownRequestError("P2002", { modelName: "Order", target: ["orderNo"] });
      }
    }
  };

  await assert.rejects(
    createOrderWithGeneratedNo(fakeClient, generatedInput(date)),
    (error) => error instanceof OrderNumberConflictError && error.message === "订单编号生成冲突，请重试。"
  );
  assert.equal(createCount, 3);
});

test("其他字段 P2002 不重试并原样抛出", async () => {
  const originalError = knownRequestError("P2002", { modelName: "Order", target: ["id"] });
  let createCount = 0;
  const fakeClient = {
    order: {
      findMany: async () => [],
      create: async () => {
        createCount += 1;
        throw originalError;
      }
    }
  };

  await assert.rejects(createOrderWithGeneratedNo(fakeClient, generatedInput(localDate(2032, 1, 4))), (error) => error === originalError);
  assert.equal(createCount, 1);
});

test("非 Order modelName 的 orderNo P2002 不重试", async () => {
  const originalError = knownRequestError("P2002", { modelName: "Customer", target: ["orderNo"] });
  let createCount = 0;
  const fakeClient = {
    order: {
      findMany: async () => [],
      create: async () => {
        createCount += 1;
        throw originalError;
      }
    }
  };

  await assert.rejects(createOrderWithGeneratedNo(fakeClient, generatedInput(localDate(2032, 1, 5))), (error) => error === originalError);
  assert.equal(createCount, 1);
});

test("未知错误不重试并原样抛出", async () => {
  const originalError = new Error("unknown integration error");
  let createCount = 0;
  const fakeClient = {
    order: {
      findMany: async () => [],
      create: async () => {
        createCount += 1;
        throw originalError;
      }
    }
  };

  await assert.rejects(createOrderWithGeneratedNo(fakeClient, generatedInput(localDate(2032, 1, 6))), (error) => error === originalError);
  assert.equal(createCount, 1);
});

test("两个独立 PrismaClient 并发创建得到不同三位订单号", async () => {
  const firstClient = new PrismaClient({ datasourceUrl: temporaryDatabaseUrl });
  const secondClient = new PrismaClient({ datasourceUrl: temporaryDatabaseUrl });
  clients.push(firstClient, secondClient);
  const date = localDate(2033, 1, 1);

  const [firstOrder, secondOrder] = await Promise.all([
    createOrderWithGeneratedNo(firstClient, generatedInput(date)),
    createOrderWithGeneratedNo(secondClient, generatedInput(date))
  ]);

  assert.notEqual(firstOrder.orderNo, secondOrder.orderNo);
  assert.match(firstOrder.orderNo, /^DD20330101\d{3}$/);
  assert.match(secondOrder.orderNo, /^DD20330101\d{3}$/);
  assert.equal(firstOrder.status, "PENDING");
  assert.equal(secondOrder.status, "PENDING");

  const stored = await client.order.findMany({
    where: { orderNo: { startsWith: "DD20330101" } },
    orderBy: { orderNo: "asc" },
    select: { orderNo: true, status: true }
  });
  assert.equal(stored.length, 2);
  assert.equal(new Set(stored.map((order) => order.orderNo)).size, 2);
  assert.equal(stored.every((order) => order.status === "PENDING"), true);
  assert.equal(stored.some((order) => order.orderNo.endsWith("1000")), false);
});

test("只有普通 Product 和 ProductPart 时三步事务删除成功", async () => {
  const { order, product, part } = await createOrderGraph(client, "普通删除");
  assert.deepEqual(await restrictedBusinessRecordCounts(client, order.id), Array(9).fill(0));

  const [partResult, productResult, deletedOrder] = await deleteOrderGraph(client, order.id);

  assert.equal(partResult.count, 1);
  assert.equal(productResult.count, 1);
  assert.equal(deletedOrder.id, order.id);
  assert.equal(await client.order.count({ where: { id: order.id } }), 0);
  assert.equal(await client.product.count({ where: { id: product.id } }), 0);
  assert.equal(await client.productPart.count({ where: { id: part.id } }), 0);
});

test("关联检查后新增 ProductPartProgressLog 会真实触发 P2003 并完整回滚", async () => {
  const deletingClient = new PrismaClient({ datasourceUrl: temporaryDatabaseUrl });
  const relationClient = new PrismaClient({ datasourceUrl: temporaryDatabaseUrl });
  clients.push(deletingClient, relationClient);
  const { order, product, part } = await createOrderGraph(deletingClient, "并发关联");

  assert.deepEqual(await restrictedBusinessRecordCounts(deletingClient, order.id), Array(9).fill(0));

  const progressLog = await relationClient.productPartProgressLog.create({
    data: {
      productPartId: part.id,
      productId: product.id,
      orderId: order.id,
      fromStatus: "PENDING",
      toStatus: "CUTTING",
      actionName: "C3b-2b2 并发关联测试"
    }
  });

  await assert.rejects(
    deleteOrderGraph(deletingClient, order.id),
    (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003"
  );

  assert.equal(await deletingClient.order.count({ where: { id: order.id } }), 1);
  assert.equal(await deletingClient.product.count({ where: { id: product.id } }), 1);
  assert.equal(await deletingClient.productPart.count({ where: { id: part.id } }), 1);
  assert.equal(await deletingClient.productPartProgressLog.count({ where: { id: progressLog.id } }), 1);
});

test("重复删除同一无关联订单真实触发 P2025", async () => {
  const order = await insertOrder(`C3B2B2-P2025-${randomUUID()}`, localDate(2034, 1, 1));
  const deletedOrder = await client.order.delete({ where: { id: order.id } });
  assert.equal(deletedOrder.id, order.id);

  await assert.rejects(
    client.order.delete({ where: { id: order.id } }),
    (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025"
  );
});

test("集成测试期间正式 dev.db SHA-256 保持不变", async () => {
  assert.equal(await sha256(formalDatabasePath), formalDatabaseHashBefore);
});
