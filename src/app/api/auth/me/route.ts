import { NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401, headers: noStoreHeaders });
  return NextResponse.json(user, { headers: noStoreHeaders });
}
