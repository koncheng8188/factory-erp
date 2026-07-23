import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "src", "app", "api");
const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
const excludedHandlers = new Set(["POST /api/auth/login", "POST /api/auth/logout"]);

const protectedHandlers = new Map([
  ["POST /api/customers", { stage: "C3a", permissions: ["customer.view", "customer.create"] }],
  ["PUT /api/customers/[id]", { stage: "C3a", permissions: ["customer.view", "customer.update"] }],
  ["DELETE /api/customers/[id]", { stage: "C3a", permissions: ["customer.view", "customer.delete"] }],
  ["POST /api/orders", { stage: "C3b-1", permissions: ["order.view", "order.create"] }],
  ["PUT /api/orders/[id]", { stage: "C3b-1", permissions: ["order.view", "order.update"] }],
  ["DELETE /api/orders/[id]", { stage: "C3b-1", permissions: ["order.view", "order.delete"] }],
  ["POST /api/orders/[id]/products", { stage: "C3c-1", permissions: ["order.view", "product.view", "product.create"] }],
  ["PUT /api/products/[id]", { stage: "C3c-1", permissions: ["product.view", "product.update"] }],
  ["DELETE /api/products/[id]", { stage: "C3c-1", permissions: ["product.view", "product.delete"] }],
  ["POST /api/parts/[id]/drawings", { stage: "C3d-1", permissions: ["part.view", "drawing.view", "drawing.upload"] }],
  ["PATCH /api/drawings/[id]", { stage: "C3d-1", permissions: ["drawing.view", "drawing.update"] }],
  ["POST /api/drawings/[id]/main", { stage: "C3d-1", permissions: ["drawing.view", "drawing.setMain"] }],
  ["DELETE /api/drawings/[id]", { stage: "C3d-1", permissions: ["drawing.view", "drawing.obsolete"] }],
  ["POST /api/products/[id]/parts", { stage: "C3c-2", permissions: ["product.view", "part.view", "part.create"] }],
  ["POST /api/products/[id]/whole-part", { stage: "C3c-2", permissions: ["product.view", "part.view", "part.create"] }],
  ["PATCH /api/parts/[id]", { stage: "C3c-2", permissions: ["part.view", "part.update"] }],
  ["DELETE /api/parts/[id]", { stage: "C3c-2", permissions: ["part.view", "part.delete"] }],
  ["POST /api/parts/[id]/advance", { stage: "C3e-1", permissions: ["order.view", "product.view", "part.view", "production.view", "production.updateProgress"] }],
  ["POST /api/parts/[id]/abnormal", { stage: "C3e-1", permissions: ["order.view", "product.view", "part.view", "production.view", "production.reportAbnormal"] }],
  ["POST /api/parts/[id]/abnormal/resolve", { stage: "C3e-1", permissions: ["order.view", "product.view", "part.view", "production.abnormal.view", "production.resolveAbnormal"] }],
  ["POST /api/products/[id]/mark-production-complete", { stage: "C3e-1", permissions: ["order.view", "product.view", "part.view", "production.view", "production.completeProduct"] }],
  ["POST /api/kitting/[productId]", { stage: "C3e-1", permissions: ["order.view", "product.view", "part.view", "kitting.view", "kitting.execute"] }],
  ["POST /api/outsourcing", { stage: "C3f-1", permissions: ["order.view", "product.view", "part.view", "drawing.view", "outsource.view", "outsource.create"] }],
  ["POST /api/returns", { stage: "C3g-1", permissions: ["order.view", "product.view", "part.view", "outsource.view", "return.view", "return.create"] }],
  ["POST /api/delivery", { stage: "C3h-1", permissions: ["order.view", "product.view", "delivery.view", "delivery.create"] }],
  ["POST /api/imports/excel/preview", { stage: "C3i-1a", permissions: ["import.view", "import.preview", "customer.view", "order.view"] }],
  ["POST /api/imports/excel/confirm", { stage: "C3i-1a", permissions: ["import.view", "import.execute", "customer.view", "customer.create", "order.view", "order.create", "product.view", "product.create", "part.view", "part.create"] }],
  ["POST /api/imports/excel/simple-preview", { stage: "C3i-1a", permissions: ["import.view", "import.preview", "customer.view", "order.view"] }],
  ["POST /api/imports/excel/simple-confirm", { stage: "C3i-1a", permissions: ["import.view", "import.execute", "customer.view", "customer.create", "order.view", "order.create", "product.view", "product.create", "part.view", "part.create"] }],
  ["POST /api/orders/[id]/import-products/preview", { stage: "C3i-1a", permissions: ["order.view", "order.importProducts"] }],
  ["POST /api/orders/[id]/import-products/confirm", { stage: "C3i-1a", permissions: ["order.view", "order.importProducts", "product.view", "product.create", "part.view", "part.create"] }]
]);

const pendingHandlers = new Map([
  ["POST /api/system/backup", "C3j"]
]);

async function routeFiles(directory = apiRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
  }));
  return nested.flat();
}

function endpointPath(filePath) {
  const relative = path.relative(apiRoot, path.dirname(filePath)).split(path.sep).join("/");
  return `/api/${relative}`;
}

async function enumerateWriteHandlers() {
  const handlers = new Map();
  for (const filePath of await routeFiles()) {
    const source = await readFile(filePath, "utf8");
    for (const method of writeMethods) {
      const marker = `export async function ${method}`;
      if (source.includes(marker)) {
        handlers.set(`${method} ${endpointPath(filePath)}`, { filePath, source, method });
      }
    }
  }
  return handlers;
}

function functionBody(source, method) {
  const marker = `export async function ${method}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `缺少 ${method} handler`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${method} handler 缺少函数体`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }
  assert.fail(`${method} handler 函数体未闭合`);
}

function compact(value) {
  return value.replace(/\s+/g, " ");
}

function withoutComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertBefore(handler, first, second, endpoint) {
  const firstIndex = handler.indexOf(first);
  const secondIndex = handler.indexOf(second);
  assert.notEqual(firstIndex, -1, `${endpoint} 找不到 ${first}`);
  assert.notEqual(secondIndex, -1, `${endpoint} 找不到 ${second}`);
  assert.ok(firstIndex < secondIndex, `${endpoint} 的 ${first} 必须早于 ${second}`);
}

const allHandlers = await enumerateWriteHandlers();
const businessHandlers = new Map([...allHandlers].filter(([endpoint]) => !excludedHandlers.has(endpoint)));
const orderNumberSource = await readFile(path.join(root, "src", "lib", "orders.ts"), "utf8");
const standardImportSource = await readFile(path.join(root, "src", "lib", "import-excel.ts"), "utf8");
const simpleImportSource = await readFile(path.join(root, "src", "lib", "import-excel-simple.ts"), "utf8");

test("写接口总数和方法分布保持基线", () => {
  assert.equal(allHandlers.size, 34);
  assert.equal(businessHandlers.size, 32);
  assert.deepEqual(
    Object.fromEntries(writeMethods.map((method) => [method, [...businessHandlers.keys()].filter((key) => key.startsWith(`${method} `)).length])),
    { POST: 22, PUT: 3, PATCH: 2, DELETE: 5 }
  );
});

test("只排除登录和登出两个认证写接口", () => {
  assert.deepEqual([...allHandlers.keys()].filter((endpoint) => excludedHandlers.has(endpoint)).sort(), [...excludedHandlers].sort());
});

test("C3i-1a 已保护接口精确为三十一个写 handler", () => {
  assert.equal(protectedHandlers.size, 31);
  assert.deepEqual([...protectedHandlers.keys()].sort(), [
    "DELETE /api/customers/[id]",
    "DELETE /api/drawings/[id]",
    "DELETE /api/orders/[id]",
    "DELETE /api/parts/[id]",
    "DELETE /api/products/[id]",
    "PATCH /api/drawings/[id]",
    "PATCH /api/parts/[id]",
    "POST /api/customers",
    "POST /api/delivery",
    "POST /api/drawings/[id]/main",
    "POST /api/imports/excel/confirm",
    "POST /api/imports/excel/preview",
    "POST /api/imports/excel/simple-confirm",
    "POST /api/imports/excel/simple-preview",
    "POST /api/kitting/[productId]",
    "POST /api/orders",
    "POST /api/orders/[id]/import-products/confirm",
    "POST /api/orders/[id]/import-products/preview",
    "POST /api/orders/[id]/products",
    "POST /api/outsourcing",
    "POST /api/parts/[id]/abnormal",
    "POST /api/parts/[id]/abnormal/resolve",
    "POST /api/parts/[id]/advance",
    "POST /api/parts/[id]/drawings",
    "POST /api/products/[id]/mark-production-complete",
    "POST /api/products/[id]/parts",
    "POST /api/products/[id]/whole-part",
    "POST /api/returns",
    "PUT /api/customers/[id]",
    "PUT /api/orders/[id]",
    "PUT /api/products/[id]"
  ]);
});

test("待实施注册表仅剩 C3j 备份接口", () => {
  assert.equal(pendingHandlers.size, 1);
  assert.deepEqual([...pendingHandlers.keys()], ["POST /api/system/backup"]);
  for (const [endpoint, stage] of pendingHandlers) {
    assert.match(stage, /^C3[b-j]$/, `${endpoint} 缺少有效实施阶段`);
  }
});

test("六个 C3i-1a 导入 POST 均已登记为 protected 且不再 pending", () => {
  const endpoints = [
    "POST /api/imports/excel/preview",
    "POST /api/imports/excel/confirm",
    "POST /api/imports/excel/simple-preview",
    "POST /api/imports/excel/simple-confirm",
    "POST /api/orders/[id]/import-products/preview",
    "POST /api/orders/[id]/import-products/confirm"
  ];
  for (const endpoint of endpoints) {
    assert.equal(protectedHandlers.get(endpoint)?.stage, "C3i-1a");
    assert.equal(pendingHandlers.has(endpoint), false);
  }
});

test("每个业务写 handler 恰好属于已保护或待实施集合", () => {
  const overlap = [...protectedHandlers.keys()].filter((endpoint) => pendingHandlers.has(endpoint));
  assert.deepEqual(overlap, []);
  assert.deepEqual(
    [...new Set([...protectedHandlers.keys(), ...pendingHandlers.keys()])].sort(),
    [...businessHandlers.keys()].sort()
  );
});

test("三十一个已保护写 handler 使用精确的完整资源链权限组合", () => {
  for (const [endpoint, definition] of protectedHandlers) {
    const handler = businessHandlers.get(endpoint);
    assert.ok(handler, `缺少 ${endpoint}`);
    const body = compact(withoutComments(functionBody(handler.source, handler.method)));
    assert.match(
      body,
      new RegExp(
        `requireApiAllPermissions\\(\\[ ${definition.permissions
          .map((permission) => `"${permission.replace(".", "\\.")}"`)
          .join(", ")}(?:,)? \\]\\)`
      ),
      `${endpoint} 权限组合不正确`
    );
  }
});

test("三十一个已保护写路由统一使用全权限助手且不回退 requireApiUser", () => {
  for (const endpoint of protectedHandlers.keys()) {
    const { source } = businessHandlers.get(endpoint);
    assert.match(source, /requireApiAllPermissions/);
    assert.doesNotMatch(source, /requireApiUser/);
  }
});

test("三十一个已保护写 handler 权限失败后立即返回", () => {
  for (const [endpoint] of protectedHandlers) {
    const { source, method } = businessHandlers.get(endpoint);
    assert.match(functionBody(source, method), /if \(!authResult\.ok\) return authResult\.response/, endpoint);
  }
});

test("POST 鉴权早于请求体解析和客户新增", () => {
  const handler = functionBody(businessHandlers.get("POST /api/customers").source, "POST");
  assertBefore(handler, "requireApiAllPermissions", "request.json()", "POST /api/customers");
  assertBefore(handler, "requireApiAllPermissions", "prisma.customer.create", "POST /api/customers");
});

test("PUT 鉴权早于参数、请求体解析和客户更新", () => {
  const handler = functionBody(businessHandlers.get("PUT /api/customers/[id]").source, "PUT");
  assertBefore(handler, "requireApiAllPermissions", "context.params", "PUT /api/customers/[id]");
  assertBefore(handler, "requireApiAllPermissions", "request.json()", "PUT /api/customers/[id]");
  assertBefore(handler, "requireApiAllPermissions", "prisma.customer.update", "PUT /api/customers/[id]");
});

test("DELETE 鉴权早于参数、关联查询和客户删除", () => {
  const handler = functionBody(businessHandlers.get("DELETE /api/customers/[id]").source, "DELETE");
  assertBefore(handler, "requireApiAllPermissions", "context.params", "DELETE /api/customers/[id]");
  assertBefore(handler, "requireApiAllPermissions", "prisma.order.count", "DELETE /api/customers/[id]");
  assertBefore(handler, "requireApiAllPermissions", "prisma.customer.delete", "DELETE /api/customers/[id]");
});

test("同文件 PUT 与 DELETE 分别检查自身权限和业务顺序", () => {
  const source = businessHandlers.get("PUT /api/customers/[id]").source;
  const putBody = functionBody(source, "PUT");
  const deleteBody = functionBody(source, "DELETE");
  assert.match(putBody, /customer\.update/);
  assert.doesNotMatch(putBody, /customer\.delete/);
  assert.match(deleteBody, /customer\.delete/);
  assert.doesNotMatch(deleteBody, /customer\.update/);
});

test("订单 POST 鉴权早于 JSON、客户查询、编号生成和 create", () => {
  const handler = functionBody(businessHandlers.get("POST /api/orders").source, "POST");
  for (const marker of ["request.json()", "prisma.customer.findUnique", "createOrderWithGeneratedNo"]) {
    assertBefore(handler, "requireApiAllPermissions", marker, "POST /api/orders");
  }
});

test("订单 PUT 鉴权早于 params、JSON、客户查询和 update", () => {
  const handler = functionBody(businessHandlers.get("PUT /api/orders/[id]").source, "PUT");
  for (const marker of ["context.params", "request.json()", "prisma.customer.findUnique", "prisma.order.update"]) {
    assertBefore(handler, "requireApiAllPermissions", marker, "PUT /api/orders/[id]");
  }
});

test("订单 DELETE 鉴权早于 params、订单查询、关联检查和事务", () => {
  const handler = functionBody(businessHandlers.get("DELETE /api/orders/[id]").source, "DELETE");
  for (const marker of ["context.params", "prisma.order.findUnique", "prisma.partDrawing.count", "prisma.$transaction", "prisma.order.delete"]) {
    assertBefore(handler, "requireApiAllPermissions", marker, "DELETE /api/orders/[id]");
  }
});

test("订单同文件 PUT 与 DELETE 分别检查自身权限", () => {
  const source = businessHandlers.get("PUT /api/orders/[id]").source;
  const putBody = functionBody(source, "PUT");
  const deleteBody = functionBody(source, "DELETE");
  assert.match(putBody, /order\.update/);
  assert.doesNotMatch(putBody, /order\.delete/);
  assert.match(deleteBody, /order\.delete/);
  assert.doesNotMatch(deleteBody, /order\.update/);
});

test("订单三个接口已从 pending 清单移除", () => {
  for (const endpoint of ["POST /api/orders", "PUT /api/orders/[id]", "DELETE /api/orders/[id]"]) {
    assert.equal(protectedHandlers.has(endpoint), true);
    assert.equal(pendingHandlers.has(endpoint), false);
  }
});

test("产品三个接口已转为 C3c-1 protected 并从 pending 移除", () => {
  for (const endpoint of [
    "POST /api/orders/[id]/products",
    "PUT /api/products/[id]",
    "DELETE /api/products/[id]"
  ]) {
    assert.equal(protectedHandlers.get(endpoint)?.stage, "C3c-1");
    assert.equal(pendingHandlers.has(endpoint), false);
  }
});

test("创建产品精确要求父订单查看、产品查看和产品创建权限", () => {
  assert.deepEqual(protectedHandlers.get("POST /api/orders/[id]/products")?.permissions, [
    "order.view",
    "product.view",
    "product.create"
  ]);
});

test("产品更新和删除精确要求各自 view 加 write 权限", () => {
  assert.deepEqual(protectedHandlers.get("PUT /api/products/[id]")?.permissions, ["product.view", "product.update"]);
  assert.deepEqual(protectedHandlers.get("DELETE /api/products/[id]")?.permissions, ["product.view", "product.delete"]);
});

test("创建产品鉴权早于 params、JSON、父订单查询和 create", () => {
  const handler = functionBody(businessHandlers.get("POST /api/orders/[id]/products").source, "POST");
  for (const marker of ["context.params", "request.json()", "prisma.order.findUnique", "prisma.product.create"]) {
    assertBefore(handler, "requireApiAllPermissions", marker, "POST /api/orders/[id]/products");
  }
});

test("更新产品鉴权早于 params、JSON 和 update", () => {
  const handler = functionBody(businessHandlers.get("PUT /api/products/[id]").source, "PUT");
  for (const marker of ["context.params", "request.json()", "prisma.product.update"]) {
    assertBefore(handler, "requireApiAllPermissions", marker, "PUT /api/products/[id]");
  }
});

test("删除产品鉴权早于 params、查询、关联检查和事务", () => {
  const handler = functionBody(businessHandlers.get("DELETE /api/products/[id]").source, "DELETE");
  for (const marker of ["context.params", "prisma.product.findUnique", "prisma.partDrawing.count", "prisma.$transaction", "prisma.product.delete"]) {
    assertBefore(handler, "requireApiAllPermissions", marker, "DELETE /api/products/[id]");
  }
});

test("产品 PUT 与 DELETE 分别检查自身权限", () => {
  const source = businessHandlers.get("PUT /api/products/[id]").source;
  const putBody = functionBody(source, "PUT");
  const deleteBody = functionBody(source, "DELETE");
  assert.match(putBody, /product\.update/);
  assert.doesNotMatch(putBody, /product\.delete/);
  assert.match(deleteBody, /product\.delete/);
  assert.doesNotMatch(deleteBody, /product\.update/);
});

test("四个部件写接口已转为 C3c-2 protected 并从 pending 移除", () => {
  const partEndpoints = [
    "POST /api/products/[id]/parts",
    "POST /api/products/[id]/whole-part",
    "PATCH /api/parts/[id]",
    "DELETE /api/parts/[id]"
  ];
  for (const endpoint of partEndpoints) {
    assert.equal(protectedHandlers.get(endpoint)?.stage, "C3c-2");
    assert.equal(pendingHandlers.has(endpoint), false);
  }
});

test("普通部件和整件创建使用完整父产品资源链权限", () => {
  for (const endpoint of ["POST /api/products/[id]/parts", "POST /api/products/[id]/whole-part"]) {
    assert.deepEqual(protectedHandlers.get(endpoint)?.permissions, ["product.view", "part.view", "part.create"]);
  }
});

test("部件更新和删除使用各自 view 加 write 权限", () => {
  assert.deepEqual(protectedHandlers.get("PATCH /api/parts/[id]")?.permissions, ["part.view", "part.update"]);
  assert.deepEqual(protectedHandlers.get("DELETE /api/parts/[id]")?.permissions, ["part.view", "part.delete"]);
});

test("普通部件创建保持权限、params、JSON、父产品查询、字段数量处理和 create 顺序", () => {
  const handler = functionBody(businessHandlers.get("POST /api/products/[id]/parts").source, "POST");
  const endpoint = "POST /api/products/[id]/parts";
  assertBefore(handler, "requireApiAllPermissions", "context.params", endpoint);
  assertBefore(handler, "context.params", "request.json()", endpoint);
  assertBefore(handler, "request.json()", "prisma.product.findUnique", endpoint);
  assertBefore(handler, "prisma.product.findUnique", "const partName", endpoint);
  assertBefore(handler, "const partName", "const productQuantity", endpoint);
  assertBefore(handler, "const productQuantity", "calculatePartTotalQuantity", endpoint);
  assertBefore(handler, "calculatePartTotalQuantity", "prisma.productPart.create", endpoint);
});

test("整件创建鉴权早于 params、父产品查询和 create", () => {
  const handler = functionBody(businessHandlers.get("POST /api/products/[id]/whole-part").source, "POST");
  for (const marker of ["context.params", "prisma.product.findUnique", "prisma.productPart.create"]) {
    assertBefore(handler, "requireApiAllPermissions", marker, "POST /api/products/[id]/whole-part");
  }
});

test("部件更新鉴权早于 params、JSON、目标查询和 update", () => {
  const handler = functionBody(businessHandlers.get("PATCH /api/parts/[id]").source, "PATCH");
  for (const marker of ["context.params", "request.json()", "prisma.productPart.findUnique", "prisma.productPart.update"]) {
    assertBefore(handler, "requireApiAllPermissions", marker, "PATCH /api/parts/[id]");
  }
});

test("部件删除鉴权早于 params、目标查询、关联检查和 delete", () => {
  const handler = functionBody(businessHandlers.get("DELETE /api/parts/[id]").source, "DELETE");
  for (const marker of ["context.params", "prisma.productPart.findUnique", "hasBusinessRecords", "prisma.productPart.delete"]) {
    assertBefore(handler, "requireApiAllPermissions", marker, "DELETE /api/parts/[id]");
  }
});

test("部件 PATCH 与 DELETE 分别检查自身权限", () => {
  const source = businessHandlers.get("PATCH /api/parts/[id]").source;
  const patchBody = functionBody(source, "PATCH");
  const deleteBody = functionBody(source, "DELETE");
  assert.match(patchBody, /part\.update/);
  assert.doesNotMatch(patchBody, /part\.delete/);
  assert.match(deleteBody, /part\.delete/);
  assert.doesNotMatch(deleteBody, /part\.update/);
});

test("唯一 pending 接口保持为备份 POST", () => {
  assert.equal(pendingHandlers.size, 1);
  assert.deepEqual([...pendingHandlers.keys()], ["POST /api/system/backup"]);
});

test("外发 POST 已从 pending 移入 C3f-1 protected", () => {
  assert.equal(protectedHandlers.get("POST /api/outsourcing")?.stage, "C3f-1");
  assert.equal(pendingHandlers.has("POST /api/outsourcing"), false);
});

test("外发 POST 注册精确六项资源链权限", () => {
  assert.deepEqual(protectedHandlers.get("POST /api/outsourcing")?.permissions, [
    "order.view",
    "product.view",
    "part.view",
    "drawing.view",
    "outsource.view",
    "outsource.create"
  ]);
});

test("外发 POST 鉴权早于请求体、编号查询、资源查询和事务", () => {
  const endpoint = "POST /api/outsourcing";
  const handler = functionBody(businessHandlers.get(endpoint).source, "POST");
  for (const marker of ["request.json()", "prisma.$transaction", "tx.outsourceOrder.findFirst", "tx.productPart.findMany", "tx.outsourceOrder.create"]) {
    assertBefore(handler, "requireApiAllPermissions", marker, endpoint);
  }
});

test("外发 POST 权限失败立即返回且不回退登录助手", () => {
  const handler = functionBody(businessHandlers.get("POST /api/outsourcing").source, "POST");
  assert.match(handler, /if \(!authResult\.ok\) return authResult\.response/);
  assert.doesNotMatch(handler, /requireApiUser/);
});

test("回厂 POST 已从 pending 移入 C3g-1 protected", () => {
  assert.equal(protectedHandlers.get("POST /api/returns")?.stage, "C3g-1");
  assert.equal(pendingHandlers.has("POST /api/returns"), false);
});

test("回厂 POST 注册精确六项资源权限且不包含 drawing.view", () => {
  assert.deepEqual(protectedHandlers.get("POST /api/returns")?.permissions, [
    "order.view",
    "product.view",
    "part.view",
    "outsource.view",
    "return.view",
    "return.create"
  ]);
});

test("回厂 POST 鉴权、JSON 和服务委托保持职责边界", async () => {
  const endpoint = "POST /api/returns";
  const route = withoutComments(businessHandlers.get(endpoint).source);
  const handler = functionBody(route, "POST");
  for (const marker of [
    "request.json()",
    "createOutsourceReturnIntegrity"
  ]) {
    assertBefore(handler, "requireApiAllPermissions", marker, endpoint);
  }
  assert.match(handler, /body = await request\.json\(\)/);
  assert.match(handler, /createOutsourceReturnIntegrity\(\{ client: prisma, input: body \}\)/);
  assert.doesNotMatch(handler, /parseDate\(|parseReturnDate\(|new Date\(body\.returnDate\)|body\.returnDate\s*=/);
  assert.doesNotMatch(handler, /errorMessage\(error/);
  assert.match(handler, /error instanceof ReturnsIntegrityError[\s\S]*?error: error\.message/);
  const integrity = withoutComments(await readFile(path.join(root, "src", "lib", "returns-integrity.ts"), "utf8"));
  assert.match(integrity, /function parseReturnDate\(value: unknown\)/);
  assert.match(integrity, /\^\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)\$/);
  assert.match(integrity, /date\.getFullYear\(\) !== Number\(yearText\)[\s\S]*?date\.getDate\(\) !== Number\(dayText\)/);
  assert.doesNotMatch(integrity, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)|return new Date\(\)/);
});

test("回厂 POST 权限失败立即返回且不回退登录助手", () => {
  const handler = functionBody(businessHandlers.get("POST /api/returns").source, "POST");
  assert.match(handler, /if \(!authResult\.ok\) return authResult\.response/);
  assert.doesNotMatch(handler, /requireApiUser/);
});

test("送货 POST 已从 pending 移入 C3h-1 protected", () => {
  assert.equal(protectedHandlers.get("POST /api/delivery")?.stage, "C3h-1");
  assert.equal(pendingHandlers.has("POST /api/delivery"), false);
});

test("送货 POST 注册精确四项资源权限", () => {
  assert.deepEqual(protectedHandlers.get("POST /api/delivery")?.permissions, [
    "order.view",
    "product.view",
    "delivery.view",
    "delivery.create"
  ]);
});

test("送货 POST 鉴权早于 JSON 并委托完整性服务", () => {
  const handler = functionBody(businessHandlers.get("POST /api/delivery").source, "POST");
  assertBefore(handler, "requireApiAllPermissions", "request.json()", "POST /api/delivery");
  assertBefore(handler, "requireApiAllPermissions", "createDeliveryIntegrity", "POST /api/delivery");
  assert.match(handler, /createDeliveryIntegrity\(\{ client: prisma, input: body \}\)/);
  assert.doesNotMatch(handler, /parseDate\(|parseQuantity\(|new Map|prisma\.\$transaction|errorMessage\(error/);
});
test("送货 POST 保持 C3h protected 分类且 Route 不传测试钩子", () => {
  const handler = functionBody(businessHandlers.get("POST /api/delivery").source, "POST");
  assert.match(handler, /createDeliveryIntegrity\(\{ client: prisma, input: body \}\)/);
  assert.doesNotMatch(handler, /dependencies:|beforeTransactionAttempt|afterSnapshotsValidated/);
});

test("送货 POST 权限失败立即返回且不回退登录助手", () => {
  const handler = functionBody(businessHandlers.get("POST /api/delivery").source, "POST");
  assert.match(handler, /if \(!authResult\.ok\) return authResult\.response/);
  assert.doesNotMatch(handler, /requireApiUser/);
});

test("五个生产与齐套写接口已从 pending 移入 C3e-1 protected", () => {
  for (const endpoint of [
    "POST /api/parts/[id]/advance",
    "POST /api/parts/[id]/abnormal",
    "POST /api/parts/[id]/abnormal/resolve",
    "POST /api/products/[id]/mark-production-complete",
    "POST /api/kitting/[productId]"
  ]) {
    assert.equal(protectedHandlers.get(endpoint)?.stage, "C3e-1");
    assert.equal(pendingHandlers.has(endpoint), false);
  }
});

test("C3e-1 五个处理器鉴权均早于 params", () => {
  for (const endpoint of [
    "POST /api/parts/[id]/advance",
    "POST /api/parts/[id]/abnormal",
    "POST /api/parts/[id]/abnormal/resolve",
    "POST /api/products/[id]/mark-production-complete",
    "POST /api/kitting/[productId]"
  ]) {
    const handler = businessHandlers.get(endpoint);
    assertBefore(functionBody(handler.source, handler.method), "requireApiAllPermissions", "context.params", endpoint);
  }
});

test("C3e-1 JSON处理器鉴权早于请求体", () => {
  for (const endpoint of [
    "POST /api/parts/[id]/abnormal",
    "POST /api/parts/[id]/abnormal/resolve"
  ]) {
    const handler = businessHandlers.get(endpoint);
    assertBefore(functionBody(handler.source, handler.method), "requireApiAllPermissions", "request.json()", endpoint);
  }
});

test("C3e-1 五个处理器鉴权早于事务", () => {
  for (const endpoint of [
    "POST /api/parts/[id]/advance",
    "POST /api/parts/[id]/abnormal",
    "POST /api/parts/[id]/abnormal/resolve",
    "POST /api/products/[id]/mark-production-complete",
    "POST /api/kitting/[productId]"
  ]) {
    const handler = businessHandlers.get(endpoint);
    assertBefore(functionBody(handler.source, handler.method), "requireApiAllPermissions", "prisma.$transaction", endpoint);
  }
});

test("四个图纸写接口均已从 pending 移入 C3d-1 protected", () => {
  const expected = [
    "POST /api/parts/[id]/drawings",
    "PATCH /api/drawings/[id]",
    "POST /api/drawings/[id]/main",
    "DELETE /api/drawings/[id]"
  ];
  for (const endpoint of expected) {
    assert.equal(protectedHandlers.get(endpoint)?.stage, "C3d-1");
    assert.equal(pendingHandlers.has(endpoint), false);
  }
});

test("C3d-1 图纸写处理器鉴权均早于各自业务边界", () => {
  for (const [endpoint, marker] of [
    ["POST /api/parts/[id]/drawings", "saveDrawingFile"],
    ["PATCH /api/drawings/[id]", "prisma.partDrawing.update"],
    ["POST /api/drawings/[id]/main", "prisma.$transaction"],
    ["DELETE /api/drawings/[id]", "prisma.partDrawing.update"]
  ]) {
    const handler = businessHandlers.get(endpoint);
    assertBefore(functionBody(handler.source, handler.method), "requireApiAllPermissions", marker, endpoint);
  }
});

test("订单编号生成显式要求 client 且不依赖全局 prisma", () => {
  assert.match(orderNumberSource, /generateOrderNo\(\s*orderDate: Date,\s*client: OrderClient,/);
  assert.doesNotMatch(orderNumberSource, /client: OrderClient\s*=|@\/lib\/prisma|\bprisma\.order/);
});

test("订单编号使用当日前缀查询且不再依赖字符串倒序", () => {
  const generator = functionBody(orderNumberSource, "generateOrderNo");
  assert.match(generator, /startsWith: prefix/);
  assert.match(generator, /client\.order\.findMany/);
  assert.doesNotMatch(generator, /orderBy|slice\(-3\)|findFirst/);
});

test("订单编号严格识别前缀后的三位数字", () => {
  const generator = functionBody(orderNumberSource, "generateOrderNo");
  assert.match(generator, /validOrderNoPattern = new RegExp/);
  assert.match(generator, /\\d\{3\}/);
  assert.match(generator, /if \(!match\) continue/);
  assert.match(generator, /if \(serial < 1\) continue/);
});

test("订单编号同时计算数据库和 reservedOrderNos", () => {
  const generator = functionBody(orderNumberSource, "generateOrderNo");
  assert.match(generator, /orders\.map\(\(order\) => order\.orderNo\)/);
  assert.match(generator, /\.\.\.reservedOrderNos/);
  assert.match(generator, /reservedOrderNos\.add\(orderNo\)/);
});

test("订单编号最大流水达到 999 时抛出稳定上限错误", () => {
  const generator = functionBody(orderNumberSource, "generateOrderNo");
  assert.match(generator, /maximumSerial >= 999/);
  assert.match(generator, /throw new OrderDailySequenceLimitError\(\)/);
  assert.match(orderNumberSource, /当日订单编号已达 999 上限，无法新增订单。/);
  assert.doesNotMatch(generator, /1000/);
});

test("订单创建服务固定最多三次且每次重新生成编号", () => {
  const creator = functionBody(orderNumberSource, "createOrderWithGeneratedNo");
  assert.match(orderNumberSource, /const MAX_ORDER_CREATE_ATTEMPTS = 3/);
  assert.match(orderNumberSource, /attempt = 1; attempt <= MAX_ORDER_CREATE_ATTEMPTS; attempt \+= 1/);
  assertBefore(creator, "generateOrderNo(input.orderDate, client)", "client.order.create", "createOrderWithGeneratedNo");
});

test("订单创建服务只接受批准输入且固定 PENDING", () => {
  assert.match(orderNumberSource, /export type GeneratedOrderInput = \{[\s\S]*?customerId: string;[\s\S]*?customerName: string;[\s\S]*?orderDate: Date;[\s\S]*?deliveryDate: Date \| null;[\s\S]*?remark: string \| null;[\s\S]*?\};/);
  const creator = functionBody(orderNumberSource, "createOrderWithGeneratedNo");
  assert.match(creator, /status: "PENDING"/);
  assert.doesNotMatch(creator, /\.\.\.input|input\.status/);
});

test("P2002 识别同时要求已知错误和精确代码", () => {
  assert.match(orderNumberSource, /error instanceof Prisma\.PrismaClientKnownRequestError/);
  assert.match(orderNumberSource, /error\.code !== "P2002"/);
});

test("P2002 modelName 存在时必须为 Order", () => {
  assert.match(orderNumberSource, /hasOwnProperty\.call\(meta, "modelName"\)/);
  assert.match(orderNumberSource, /meta\.modelName !== "Order"/);
});

test("P2002 target 兼容数组和字符串且精确为单个 orderNo", () => {
  assert.match(orderNumberSource, /Array\.isArray\(target\) \? target : typeof target === "string" \? \[target\] : \[\]/);
  assert.match(orderNumberSource, /fields\.length === 1 && fields\[0\] === "orderNo"/);
  assert.doesNotMatch(orderNumberSource, /includes\(["']orderNo["']\)/);
});

test("非 orderNo P2002 和未知错误立即原样抛出", () => {
  const creator = functionBody(orderNumberSource, "createOrderWithGeneratedNo");
  assert.match(creator, /if \(!isOrderNoUniqueConflict\(error\)\) throw error/);
  assert.doesNotMatch(creator, /P1008|P2024|P2034|locked/i);
});

test("三次编号冲突耗尽抛出稳定错误", () => {
  const creator = functionBody(orderNumberSource, "createOrderWithGeneratedNo");
  assert.match(creator, /attempt === MAX_ORDER_CREATE_ATTEMPTS/);
  assert.match(creator, /throw new OrderNumberConflictError\(\)/);
  assert.match(orderNumberSource, /订单编号生成冲突，请重试。/);
});

test("标准和简化导入继续显式传入 tx 与保留号集合", () => {
  for (const source of [standardImportSource, simpleImportSource]) {
    assert.match(source, /generateOrderNo\(orderDate, tx, reservedOrderNos\)/);
  }
});

test("订单 DELETE 保持 C3b-2b1 范围外", () => {
  const handler = functionBody(businessHandlers.get("DELETE /api/orders/[id]").source, "DELETE");
  assert.doesNotMatch(handler, /P2003|isForeignKey/i);
  assert.match(handler, /prisma\.\$transaction\(\[/);
});

test("待实施集合仅作清单，不被误判为已经安全", () => {
  for (const endpoint of pendingHandlers.keys()) {
    assert.equal(protectedHandlers.has(endpoint), false, `${endpoint} 不得同时标记为已保护`);
  }
});

test("注册表测试本身只读扫描源码，不执行应用写操作", async () => {
  const self = await readFile(fileURLToPath(import.meta.url), "utf8");
  assert.doesNotMatch(self, /from ["']@\/lib\/prisma["']/);
  assert.doesNotMatch(self, /\bfetch\s*\(/);
  assert.doesNotMatch(self, /\b(writeFile|appendFile|rm|unlink|rename|mkdir)\s*\(/);
});
