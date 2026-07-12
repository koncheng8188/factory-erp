export type UserRole = "ADMIN" | "OWNER" | "SALES" | "PRODUCTION" | "OUTSOURCE" | "DELIVERY";

export const permissions = [
  "dashboard.view",
  "customer.view", "customer.create", "customer.update", "customer.delete",
  "order.view", "order.create", "order.update", "order.delete", "order.print", "order.importProducts",
  "product.view", "product.create", "product.update", "product.delete",
  "part.view", "part.create", "part.update", "part.delete",
  "drawing.view", "drawing.viewOriginal", "drawing.upload", "drawing.update", "drawing.setMain", "drawing.obsolete",
  "production.view", "production.updateProgress", "production.completeProduct", "production.reportAbnormal", "production.resolveAbnormal", "production.print",
  "production.daily.view", "production.daily.print",
  "production.abnormal.view", "production.abnormal.print",
  "kitting.view", "kitting.execute",
  "outsource.view", "outsource.create", "outsource.print",
  "return.view", "return.create", "return.print",
  "delivery.view", "delivery.create", "delivery.print",
  "import.view", "import.preview", "import.execute",
  "dataManagement.view",
  "backup.view", "backup.create",
  "settings.view",
  "user.view", "user.create", "user.update", "user.disable", "user.resetPassword", "user.assignRole", "user.revokeSessions", "user.managePermissions", "user.manageAdmins",
  "audit.view"
] as const;

export type Permission = (typeof permissions)[number];
export type PermissionEffect = "ALLOW" | "DENY";

export type UserPermissionOverride = {
  permission: string;
  effect: PermissionEffect;
};

export type PermissionDecisionSource =
  | "ADMIN_ROLE"
  | "USER_DENY"
  | "USER_ALLOW"
  | "ROLE_DEFAULT"
  | "DEFAULT_DENY"
  | "INVALID_PERMISSION"
  | "NON_DELEGATABLE_ALLOW";

export type PermissionDecision = {
  allowed: boolean;
  source: PermissionDecisionSource;
  reason: string;
};

export type PermissionOverrideValidation = {
  valid: boolean;
  ignored: boolean;
  reason: PermissionDecisionSource;
};

const permissionSet: ReadonlySet<string> = new Set(permissions);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && permissionSet.has(value);
}

export const delegatablePermissions = [
  "dashboard.view",
  "customer.view", "customer.create", "customer.update", "customer.delete",
  "order.view", "order.create", "order.update", "order.delete", "order.print", "order.importProducts",
  "product.view", "product.create", "product.update", "product.delete",
  "part.view", "part.create", "part.update", "part.delete",
  "drawing.view", "drawing.viewOriginal", "drawing.upload", "drawing.update", "drawing.setMain", "drawing.obsolete",
  "production.view", "production.updateProgress", "production.completeProduct", "production.reportAbnormal", "production.resolveAbnormal", "production.print",
  "production.daily.view", "production.daily.print",
  "production.abnormal.view", "production.abnormal.print",
  "kitting.view", "kitting.execute",
  "outsource.view", "outsource.create", "outsource.print",
  "return.view", "return.create", "return.print",
  "delivery.view", "delivery.create", "delivery.print"
] as const satisfies readonly Permission[];

const delegatablePermissionSet: ReadonlySet<string> = new Set(delegatablePermissions);

export function isDelegatablePermission(permission: unknown): permission is (typeof delegatablePermissions)[number] {
  return isPermission(permission) && delegatablePermissionSet.has(permission);
}

const ownerPermissions = permissions.filter(
  (permission) => permission !== "user.managePermissions" && permission !== "user.manageAdmins"
);

export const rolePermissionMap = {
  ADMIN: permissions,
  OWNER: ownerPermissions,
  SALES: [
    "dashboard.view",
    "customer.view", "customer.create", "customer.update",
    "order.view", "order.create", "order.update", "order.print", "order.importProducts",
    "product.view", "product.create", "product.update",
    "part.view", "part.create", "part.update",
    "drawing.view", "drawing.viewOriginal", "drawing.upload", "drawing.update", "drawing.setMain", "drawing.obsolete",
    "production.view", "production.print", "production.daily.view", "production.daily.print", "production.abnormal.view", "production.abnormal.print",
    "kitting.view",
    "outsource.view", "outsource.print",
    "return.view", "return.print",
    "delivery.view", "delivery.print"
  ],
  PRODUCTION: [
    "dashboard.view",
    "order.view", "product.view", "part.view",
    "drawing.view", "drawing.viewOriginal",
    "production.view", "production.updateProgress", "production.completeProduct", "production.reportAbnormal", "production.resolveAbnormal", "production.print",
    "production.daily.view", "production.daily.print", "production.abnormal.view", "production.abnormal.print",
    "kitting.view", "kitting.execute",
    "outsource.view", "return.view", "delivery.view"
  ],
  OUTSOURCE: [
    "dashboard.view",
    "order.view", "product.view", "part.view",
    "drawing.view", "drawing.viewOriginal",
    "production.view", "kitting.view",
    "outsource.view", "outsource.create", "outsource.print",
    "return.view", "return.create", "return.print",
    "delivery.view"
  ],
  DELIVERY: [
    "dashboard.view",
    "order.view", "product.view", "part.view",
    "drawing.view",
    "return.view",
    "delivery.view", "delivery.create", "delivery.print"
  ]
} as const satisfies Record<UserRole, readonly Permission[]>;

export function validatePermissionOverride(
  role: UserRole,
  override: UserPermissionOverride
): PermissionOverrideValidation {
  if (!isPermission(override.permission)) {
    return { valid: false, ignored: false, reason: "INVALID_PERMISSION" };
  }
  if (role === "ADMIN") {
    return { valid: true, ignored: true, reason: "ADMIN_ROLE" };
  }
  if (override.effect === "DENY") {
    return { valid: true, ignored: false, reason: "USER_DENY" };
  }
  if (!isDelegatablePermission(override.permission)) {
    return { valid: false, ignored: false, reason: "NON_DELEGATABLE_ALLOW" };
  }
  return { valid: true, ignored: false, reason: "USER_ALLOW" };
}

export function resolveEffectivePermissions(
  role: UserRole,
  overrides: readonly UserPermissionOverride[] = []
): ReadonlySet<Permission> {
  if (role === "ADMIN") return new Set(permissions);

  const effective = new Set<Permission>(rolePermissionMap[role]);
  const denied = new Set<Permission>();

  for (const override of overrides) {
    const validation = validatePermissionOverride(role, override);
    if (!validation.valid || validation.ignored || !isPermission(override.permission)) continue;
    if (override.effect === "ALLOW") effective.add(override.permission);
    else denied.add(override.permission);
  }

  for (const permission of denied) effective.delete(permission);
  return effective;
}

export function getPermissionDecision(
  role: UserRole,
  permission: string,
  overrides: readonly UserPermissionOverride[] = []
): PermissionDecision {
  if (!isPermission(permission)) {
    return { allowed: false, source: "INVALID_PERMISSION", reason: "权限未定义，默认拒绝" };
  }
  if (role === "ADMIN") {
    return { allowed: true, source: "ADMIN_ROLE", reason: "ADMIN 拥有全部已定义权限并忽略个人覆盖" };
  }

  const matching = overrides.filter((override) => override.permission === permission);
  if (matching.some((override) => override.effect === "DENY")) {
    return { allowed: false, source: "USER_DENY", reason: "个人明确禁止优先" };
  }
  if (matching.some((override) => override.effect === "ALLOW")) {
    if (isDelegatablePermission(permission)) {
      return { allowed: true, source: "USER_ALLOW", reason: "个人额外允许" };
    }
    return { allowed: false, source: "NON_DELEGATABLE_ALLOW", reason: "该权限禁止通过个人 ALLOW 下放" };
  }
  if ((rolePermissionMap[role] as readonly Permission[]).includes(permission)) {
    return { allowed: true, source: "ROLE_DEFAULT", reason: "角色默认权限" };
  }
  return { allowed: false, source: "DEFAULT_DENY", reason: "无角色默认权限或有效个人授权" };
}

export function hasPermission(
  role: UserRole,
  permission: string,
  overrides: readonly UserPermissionOverride[] = []
): boolean {
  return getPermissionDecision(role, permission, overrides).allowed;
}

export class PermissionDeniedError extends Error {
  readonly statusCode = 403;
  readonly permission: string;

  constructor(permission: string) {
    super("没有执行此操作的权限");
    this.name = "PermissionDeniedError";
    this.permission = permission;
  }
}

export function assertPermission(
  role: UserRole,
  permission: string,
  overrides: readonly UserPermissionOverride[] = []
): asserts permission is Permission {
  if (!hasPermission(role, permission, overrides)) throw new PermissionDeniedError(permission);
}
