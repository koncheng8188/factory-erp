import { NextResponse } from "next/server";
import { getCurrentUser, type SafeUser } from "./current-user";

export type ApiAuthResult = { ok: true; user: SafeUser } | { ok: false; response: NextResponse };

export async function requireApiUser(): Promise<ApiAuthResult> {
  const user = await getCurrentUser();
  if (user) return { ok: true, user };
  return {
    ok: false,
    response: NextResponse.json(
      { error: "未登录或登录已过期" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  };
}
