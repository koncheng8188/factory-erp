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
  ["DELETE /api/customers/[id]", { stage: "C3a", permissions: ["customer.view", "customer.delete"] }]
]);

const pendingHandlers = new Map([
  ["POST /api/delivery", "C3h"],
  ["POST /api/drawings/[id]/main", "C3d"],
  ["PATCH /api/drawings/[id]", "C3d"],
  ["DELETE /api/drawings/[id]", "C3d"],
  ["POST /api/imports/excel/confirm", "C3i"],
  ["POST /api/imports/excel/preview", "C3i"],
  ["POST /api/imports/excel/simple-confirm", "C3i"],
  ["POST /api/imports/excel/simple-preview", "C3i"],
  ["POST /api/kitting/[productId]", "C3e"],
  ["POST /api/orders", "C3b"],
  ["POST /api/orders/[id]/import-products/confirm", "C3i"],
  ["POST /api/orders/[id]/import-products/preview", "C3i"],
  ["POST /api/orders/[id]/products", "C3c"],
  ["PUT /api/orders/[id]", "C3b"],
  ["DELETE /api/orders/[id]", "C3b"],
  ["POST /api/outsourcing", "C3f"],
  ["POST /api/parts/[id]/abnormal/resolve", "C3e"],
  ["POST /api/parts/[id]/abnormal", "C3e"],
  ["POST /api/parts/[id]/advance", "C3e"],
  ["POST /api/parts/[id]/drawings", "C3d"],
  ["PATCH /api/parts/[id]", "C3c"],
  ["DELETE /api/parts/[id]", "C3c"],
  ["POST /api/products/[id]/mark-production-complete", "C3e"],
  ["POST /api/products/[id]/parts", "C3c"],
  ["PUT /api/products/[id]", "C3c"],
  ["DELETE /api/products/[id]", "C3c"],
  ["POST /api/products/[id]/whole-part", "C3c"],
  ["POST /api/returns", "C3g"],
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

function assertBefore(handler, first, second, endpoint) {
  const firstIndex = handler.indexOf(first);
  const secondIndex = handler.indexOf(second);
  assert.notEqual(firstIndex, -1, `${endpoint} 找不到 ${first}`);
  assert.notEqual(secondIndex, -1, `${endpoint} 找不到 ${second}`);
  assert.ok(firstIndex < secondIndex, `${endpoint} 的 ${first} 必须早于 ${second}`);
}

const allHandlers = await enumerateWriteHandlers();
const businessHandlers = new Map([...allHandlers].filter(([endpoint]) => !excludedHandlers.has(endpoint)));

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

test("C3a 已保护接口精确为三个客户写 handler", () => {
  assert.equal(protectedHandlers.size, 3);
  assert.deepEqual([...protectedHandlers.keys()].sort(), [
    "DELETE /api/customers/[id]",
    "POST /api/customers",
    "PUT /api/customers/[id]"
  ]);
});

test("待实施注册表精确为 29 个且均记录阶段", () => {
  assert.equal(pendingHandlers.size, 29);
  for (const [endpoint, stage] of pendingHandlers) {
    assert.match(stage, /^C3[b-j]$/, `${endpoint} 缺少有效实施阶段`);
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

test("三个客户写 handler 使用精确的 view 加 write 权限组合", () => {
  for (const [endpoint, definition] of protectedHandlers) {
    const handler = businessHandlers.get(endpoint);
    assert.ok(handler, `缺少 ${endpoint}`);
    const body = compact(functionBody(handler.source, handler.method));
    assert.match(
      body,
      new RegExp(`requireApiAllPermissions\\(\\[ "${definition.permissions[0].replace(".", "\\.")}", "${definition.permissions[1].replace(".", "\\.")}" \\]\\)`),
      `${endpoint} 权限组合不正确`
    );
  }
});

test("客户写路由统一使用全权限助手且不回退 requireApiUser", () => {
  for (const endpoint of protectedHandlers.keys()) {
    const { source } = businessHandlers.get(endpoint);
    assert.match(source, /requireApiAllPermissions/);
    assert.doesNotMatch(source, /requireApiUser/);
  }
});

test("三个客户写 handler 权限失败后立即返回", () => {
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
