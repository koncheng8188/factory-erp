import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  calculateProductPartTotalQuantity,
  parseStrictPositiveInteger,
  PositiveIntegerValidationError,
  ProductPartPlanConflictError,
  ProductPartTotalQuantityValidationError,
  PRISMA_INT_MAX,
  updateProductPartPlan
} from "../src/lib/product-part-integrity.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const formalDatabasePath = path.join(root, "prisma", "dev.db");
const temporaryRoot = path.join(tmpdir(), `jinhong-erp-c3c3a-${process.pid}-${randomUUID()}`);
const temporaryDatabasePath = path.join(temporaryRoot, "test.db");
const temporaryDatabaseUrl = `file:${temporaryDatabasePath.replaceAll("\\", "/")}`;
const clients = [];
let client;
let customer;
let cleanupCompleted = false;

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
  cleanupCompleted = true;
}

after(async () => {
  try {
    await disconnectClients();
    assert.equal(await sha256(formalDatabasePath), formalDatabaseHashBefore, "正式 dev.db SHA-256 发生变化");
  } finally {
    if (!cleanupCompleted) {
      await removeTemporaryDatabase();
    }
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
    data: { name: "C3c-3a 临时数量完整性测试客户" }
  });
});

async function createPlanPart({
  productQuantity = 10,
  unitQuantity = 2,
  partProductQuantity = productQuantity,
  outsourcedQuantity = 0,
  returnedQuantity = 0,
  missingQuantity = 0,
  status = "PENDING"
} = {}) {
  const order = await client.order.create({
    data: {
      orderNo: `C3C3A-${randomUUID()}`,
      customerId: customer.id,
      customerName: customer.name,
      status: "PENDING"
    }
  });
  const product = await client.product.create({
    data: {
      orderId: order.id,
      productName: `数量测试产品-${randomUUID()}`,
      quantity: productQuantity,
      status: "PENDING"
    }
  });
  const part = await client.productPart.create({
    data: {
      orderId: order.id,
      productId: product.id,
      partName: `数量测试部件-${randomUUID()}`,
      unitQuantity,
      productQuantity: partProductQuantity,
      totalQuantity: unitQuantity * partProductQuantity,
      outsourcedQuantity,
      returnedQuantity,
      missingQuantity,
      status
    }
  });
  return { order, product, part };
}

function updateInput(overrides = {}) {
  return {
    partName: "更新后的测试部件",
    partCode: "C3C3A",
    specification: "规格",
    material: "材质",
    unitQuantity: 2,
    productQuantity: 5,
    surfaceTreatment: "表面处理",
    color: "颜色",
    remark: "数量完整性测试",
    ...overrides
  };
}

test("1. 正整数 number 通过严格解析", () => {
  assert.equal(parseStrictPositiveInteger(12, "产品数量"), 12);
});

test("2. 规范正整数字符串通过严格解析", () => {
  assert.equal(parseStrictPositiveInteger("2147483647", "产品数量"), PRISMA_INT_MAX);
});

test("3. 0 被拒绝", () => {
  assert.throws(() => parseStrictPositiveInteger(0, "产品数量"), PositiveIntegerValidationError);
});

test("4. 负数被拒绝", () => {
  assert.throws(() => parseStrictPositiveInteger(-1, "产品数量"), PositiveIntegerValidationError);
});

test("5. 小数被拒绝", () => {
  assert.throws(() => parseStrictPositiveInteger(1.5, "产品数量"), PositiveIntegerValidationError);
});

test("6. 空白字符串被拒绝", () => {
  assert.throws(() => parseStrictPositiveInteger("   ", "产品数量"), PositiveIntegerValidationError);
});

test("7. 布尔值被拒绝", () => {
  assert.throws(() => parseStrictPositiveInteger(true, "产品数量"), PositiveIntegerValidationError);
});

test("8. 数组被拒绝", () => {
  assert.throws(() => parseStrictPositiveInteger([1], "产品数量"), PositiveIntegerValidationError);
});

test("9. 对象被拒绝", () => {
  assert.throws(() => parseStrictPositiveInteger({ value: 1 }, "产品数量"), PositiveIntegerValidationError);
});

test("10. 科学计数法字符串被拒绝", () => {
  assert.throws(() => parseStrictPositiveInteger("1e3", "产品数量"), PositiveIntegerValidationError);
});

test("11. 超过 Prisma Int 上限被拒绝", () => {
  assert.throws(() => parseStrictPositiveInteger(PRISMA_INT_MAX + 1, "产品数量"), PositiveIntegerValidationError);
});

test("12. totalQuantity 正常乘积正确", () => {
  assert.equal(calculateProductPartTotalQuantity(12, 8), 96);
});

test("13. totalQuantity 超过 Prisma Int 上限被拒绝", () => {
  assert.throws(
    () => calculateProductPartTotalQuantity(PRISMA_INT_MAX, 2),
    ProductPartTotalQuantityValidationError
  );
});

test("14. 客户端totalQuantity字段不能控制服务端结果", async () => {
  const { part } = await createPlanPart();
  const updated = await updateProductPartPlan(client, part.id, {
    ...updateInput({ unitQuantity: 4, productQuantity: 5 }),
    totalQuantity: 1
  });
  assert.equal(updated.totalQuantity, 20);
});

test("15. 无累计量时允许修改计划数量", async () => {
  const { part } = await createPlanPart();
  const updated = await updateProductPartPlan(client, part.id, updateInput({ unitQuantity: 3, productQuantity: 4 }));
  assert.equal(updated.totalQuantity, 12);
});

test("16. 允许增加计划数量", async () => {
  const { part } = await createPlanPart({ unitQuantity: 1, partProductQuantity: 5 });
  const updated = await updateProductPartPlan(client, part.id, updateInput({ unitQuantity: 3, productQuantity: 5 }));
  assert.equal(updated.totalQuantity, 15);
});

test("17. 允许减少但仍不低于累计量", async () => {
  const { part } = await createPlanPart({
    unitQuantity: 4,
    partProductQuantity: 5,
    outsourcedQuantity: 8,
    returnedQuantity: 6,
    missingQuantity: 2
  });
  const updated = await updateProductPartPlan(client, part.id, updateInput({ unitQuantity: 2, productQuantity: 5 }));
  assert.equal(updated.totalQuantity, 10);
});

test("18. 新总量低于outsourcedQuantity时拒绝", async () => {
  const { part } = await createPlanPart({ outsourcedQuantity: 9, missingQuantity: 9 });
  await assert.rejects(
    updateProductPartPlan(client, part.id, updateInput({ unitQuantity: 2, productQuantity: 4 })),
    ProductPartPlanConflictError
  );
});

test("19. 新总量低于returnedQuantity时拒绝", async () => {
  const { part } = await createPlanPart({ returnedQuantity: 9, status: "RETURNED" });
  await assert.rejects(
    updateProductPartPlan(client, part.id, updateInput({ unitQuantity: 2, productQuantity: 4 })),
    ProductPartPlanConflictError
  );
});

test("20. 累计下限冲突时原计划数量保持不变", async () => {
  const { part } = await createPlanPart({ unitQuantity: 3, partProductQuantity: 5, outsourcedQuantity: 12, missingQuantity: 12 });
  await assert.rejects(
    updateProductPartPlan(client, part.id, updateInput({ unitQuantity: 2, productQuantity: 5 })),
    ProductPartPlanConflictError
  );
  const current = await client.productPart.findUniqueOrThrow({ where: { id: part.id } });
  assert.deepEqual(
    [current.unitQuantity, current.productQuantity, current.totalQuantity],
    [part.unitQuantity, part.productQuantity, part.totalQuantity]
  );
});

test("21. 成功更新时outsourcedQuantity和returnedQuantity不变", async () => {
  const { part } = await createPlanPart({ outsourcedQuantity: 5, returnedQuantity: 3, missingQuantity: 2 });
  const updated = await updateProductPartPlan(client, part.id, updateInput({ unitQuantity: 3, productQuantity: 4 }));
  assert.deepEqual(
    [updated.outsourcedQuantity, updated.returnedQuantity],
    [part.outsourcedQuantity, part.returnedQuantity]
  );
});

test("22. 成功更新时missingQuantity不变", async () => {
  const { part } = await createPlanPart({ outsourcedQuantity: 5, returnedQuantity: 3, missingQuantity: 7 });
  const updated = await updateProductPartPlan(client, part.id, updateInput({ unitQuantity: 3, productQuantity: 4 }));
  assert.equal(updated.missingQuantity, 7);
});

test("23. 成功更新时status不变", async () => {
  const { part } = await createPlanPart({ status: "OUTSOURCING" });
  const updated = await updateProductPartPlan(client, part.id, updateInput({ unitQuantity: 3, productQuantity: 4 }));
  assert.equal(updated.status, "OUTSOURCING");
});

test("24. 成功更新后totalQuantity始终等于两项计划数量乘积", async () => {
  const { part } = await createPlanPart();
  const updated = await updateProductPartPlan(client, part.id, updateInput({ unitQuantity: "7", productQuantity: "8" }));
  assert.equal(updated.totalQuantity, updated.unitQuantity * updated.productQuantity);
});

test("25. 修改Product.quantity不自动同步已有部件", async () => {
  const { product, part } = await createPlanPart({ productQuantity: 10, partProductQuantity: 10 });
  await client.product.update({ where: { id: product.id }, data: { quantity: 20 } });
  const current = await client.productPart.findUniqueOrThrow({ where: { id: part.id } });
  assert.deepEqual([current.productQuantity, current.totalQuantity], [10, 20]);
});

test("26. ProductPart.productQuantity可独立于Product.quantity维护", async () => {
  const { product, part } = await createPlanPart({ productQuantity: 10, partProductQuantity: 4 });
  const updated = await updateProductPartPlan(client, part.id, updateInput({ unitQuantity: 3, productQuantity: 6 }));
  const currentProduct = await client.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(currentProduct.quantity, 10);
  assert.deepEqual([updated.productQuantity, updated.totalQuantity], [6, 18]);
});

test("27. 数量完整性测试期间正式dev.db SHA-256保持不变", async () => {
  assert.equal(await sha256(formalDatabasePath), formalDatabaseHashBefore);
});

test("28. 临时SQLite数据库和sidecar及测试目录全部清理", async () => {
  await disconnectClients();
  await removeTemporaryDatabase();
  await assert.rejects(access(temporaryRoot), (error) => error?.code === "ENOENT");
});
