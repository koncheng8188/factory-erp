import { NextResponse } from "next/server";
import { noStoreHeaders, SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { clearSessionCookie, deleteSessionByToken } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const token = (await (await import("next/headers")).cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (token) await deleteSessionByToken(token);
  await clearSessionCookie();
  return NextResponse.json({ success: true }, { headers: noStoreHeaders });
}
