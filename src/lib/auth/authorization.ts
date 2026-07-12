import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { Permission } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";
import { requireApiUser, type ApiAuthResult } from "./api-user";
import { requirePageUser, type SafeUser } from "./current-user";

const noOverrides = [] as const;

function forbiddenResponse(): ApiAuthResult {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "FORBIDDEN", message: "没有执行此操作的权限" },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    )
  };
}

export async function requirePagePermission(permission: Permission): Promise<SafeUser> {
  const user = await requirePageUser();
  if (!hasPermission(user.role, permission, noOverrides)) redirect("/forbidden");
  return user;
}

export async function requirePageAnyPermission(permissions: readonly Permission[]): Promise<SafeUser> {
  const user = await requirePageUser();
  if (!permissions.some((permission) => hasPermission(user.role, permission, noOverrides))) redirect("/forbidden");
  return user;
}

export async function requirePageAllPermissions(permissions: readonly Permission[]): Promise<SafeUser> {
  const user = await requirePageUser();
  if (!permissions.every((permission) => hasPermission(user.role, permission, noOverrides))) redirect("/forbidden");
  return user;
}

export async function requireApiPermission(permission: Permission): Promise<ApiAuthResult> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth;
  return hasPermission(auth.user.role, permission, noOverrides) ? auth : forbiddenResponse();
}

export async function requireApiAnyPermission(permissions: readonly Permission[]): Promise<ApiAuthResult> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth;
  return permissions.some((permission) => hasPermission(auth.user.role, permission, noOverrides))
    ? auth
    : forbiddenResponse();
}

export async function requireApiAllPermissions(permissions: readonly Permission[]): Promise<ApiAuthResult> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth;
  return permissions.every((permission) => hasPermission(auth.user.role, permission, noOverrides))
    ? auth
    : forbiddenResponse();
}
