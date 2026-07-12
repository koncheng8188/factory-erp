import test from "node:test";
import assert from "node:assert/strict";
import {
  PermissionDeniedError,
  assertPermission,
  delegatablePermissions,
  getPermissionDecision,
  hasPermission,
  isDelegatablePermission,
  isPermission,
  permissions,
  resolveEffectivePermissions,
  rolePermissionMap,
  validatePermissionOverride
} from "../src/lib/permissions.ts";

const roles = ["ADMIN", "OWNER", "SALES", "PRODUCTION", "OUTSOURCE", "DELIVERY"];

test("六个角色全部存在", () => assert.deepEqual(Object.keys(rolePermissionMap), roles));
test("每个角色映射只包含合法权限", () => {
  for (const role of roles) for (const permission of rolePermissionMap[role]) assert.equal(isPermission(permission), true);
});
test("ADMIN 拥有全部定义权限", () => assert.deepEqual([...resolveEffectivePermissions("ADMIN")], [...permissions]));
test("ADMIN 忽略个人 ALLOW 和 DENY", () => {
  assert.equal(hasPermission("ADMIN", "order.create", [{ permission: "order.create", effect: "DENY" }]), true);
  assert.equal(hasPermission("ADMIN", "backup.create", [{ permission: "backup.create", effect: "ALLOW" }]), true);
});
test("OWNER 没有权限管理和管理员管理权限", () => {
  assert.equal(hasPermission("OWNER", "user.managePermissions"), false);
  assert.equal(hasPermission("OWNER", "user.manageAdmins"), false);
});
test("OWNER 默认拥有 backup.create", () => assert.equal(hasPermission("OWNER", "backup.create"), true));
test("OWNER 的 backup.create 可被个人 DENY 收回", () => assert.equal(hasPermission("OWNER", "backup.create", [{ permission: "backup.create", effect: "DENY" }]), false));
test("SALES 默认拥有 order.create", () => assert.equal(hasPermission("SALES", "order.create"), true));
test("SALES 默认没有 delivery.create", () => assert.equal(hasPermission("SALES", "delivery.create"), false));
test("SALES 可通过 ALLOW 获得 delivery.create", () => assert.equal(hasPermission("SALES", "delivery.create", [{ permission: "delivery.create", effect: "ALLOW" }]), true));
test("SALES 不能通过 ALLOW 获得 backup.create", () => assert.equal(hasPermission("SALES", "backup.create", [{ permission: "backup.create", effect: "ALLOW" }]), false));
test("SALES 的 order.create 可被 DENY", () => assert.equal(hasPermission("SALES", "order.create", [{ permission: "order.create", effect: "DENY" }]), false));
test("PRODUCTION 拥有 production.updateProgress", () => assert.equal(hasPermission("PRODUCTION", "production.updateProgress"), true));
test("PRODUCTION 没有 order.update", () => assert.equal(hasPermission("PRODUCTION", "order.update"), false));
test("OUTSOURCE 拥有 outsource.create 和 return.create", () => {
  assert.equal(hasPermission("OUTSOURCE", "outsource.create"), true);
  assert.equal(hasPermission("OUTSOURCE", "return.create"), true);
});
test("OUTSOURCE 没有 delivery.create", () => assert.equal(hasPermission("OUTSOURCE", "delivery.create"), false));
test("DELIVERY 拥有 delivery.create", () => assert.equal(hasPermission("DELIVERY", "delivery.create"), true));
test("DELIVERY 没有 drawing.viewOriginal", () => assert.equal(hasPermission("DELIVERY", "drawing.viewOriginal"), false));
test("同一权限同时 ALLOW 和 DENY 时 DENY 优先", () => {
  const overrides = [{ permission: "delivery.create", effect: "ALLOW" }, { permission: "delivery.create", effect: "DENY" }];
  assert.equal(hasPermission("SALES", "delivery.create", overrides), false);
  assert.equal(resolveEffectivePermissions("SALES", overrides).has("delivery.create"), false);
});
test("未知权限永远不能被授予", () => assert.equal(hasPermission("SALES", "unknown.permission", [{ permission: "unknown.permission", effect: "ALLOW" }]), false));
test("isPermission 正确识别合法和非法权限", () => {
  assert.equal(isPermission("order.view"), true);
  assert.equal(isPermission("order.veiw"), false);
  assert.equal(isPermission(null), false);
});
test("isDelegatablePermission 区分业务权限和系统权限", () => {
  assert.equal(isDelegatablePermission("delivery.create"), true);
  assert.equal(isDelegatablePermission("backup.create"), false);
});
test("assertPermission 无权限时抛出专用错误", () => assert.throws(() => assertPermission("DELIVERY", "drawing.viewOriginal"), PermissionDeniedError));
test("PermissionDeniedError 的状态码为 403", () => assert.equal(new PermissionDeniedError("order.delete").statusCode, 403));
test("权限映射和权限常量没有重复项", () => {
  assert.equal(new Set(permissions).size, permissions.length);
  assert.equal(new Set(delegatablePermissions).size, delegatablePermissions.length);
  for (const role of roles) assert.equal(new Set(rolePermissionMap[role]).size, rolePermissionMap[role].length);
});
test("默认拒绝规则有效", () => assert.deepEqual(getPermissionDecision("DELIVERY", "customer.view").source, "DEFAULT_DENY"));
test("任一权限判断逻辑正确", () => assert.equal(["customer.view", "delivery.create"].some((permission) => hasPermission("DELIVERY", permission)), true));
test("全部权限判断逻辑正确", () => assert.equal(["delivery.view", "delivery.create"].every((permission) => hasPermission("DELIVERY", permission)), true));
test("非法覆盖和不可下放 ALLOW 返回明确验证结果", () => {
  assert.deepEqual(validatePermissionOverride("SALES", { permission: "invalid", effect: "ALLOW" }), { valid: false, ignored: false, reason: "INVALID_PERMISSION" });
  assert.deepEqual(validatePermissionOverride("SALES", { permission: "backup.create", effect: "ALLOW" }), { valid: false, ignored: false, reason: "NON_DELEGATABLE_ALLOW" });
});
test("ADMIN 覆盖被标记为忽略", () => assert.deepEqual(validatePermissionOverride("ADMIN", { permission: "order.view", effect: "DENY" }), { valid: true, ignored: true, reason: "ADMIN_ROLE" }));
