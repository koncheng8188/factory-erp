import { NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/auth/constants";
import { validatePassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const employeeNo = typeof body === "object" && body !== null && "employeeNo" in body && typeof body.employeeNo === "string" ? body.employeeNo.trim() : "";
    const password = typeof body === "object" && body !== null && "password" in body && typeof body.password === "string" ? body.password : "";
    if (!employeeNo) return NextResponse.json({ error: "请输入员工编号" }, { status: 400, headers: noStoreHeaders });
    if (!validatePassword(password)) return NextResponse.json({ error: "密码至少需要 8 位" }, { status: 400, headers: noStoreHeaders });
    const user = await prisma.user.findUnique({ where: { employeeNo } });
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "员工编号或密码错误，或账号已停用" }, { status: 401, headers: noStoreHeaders });
    }
    await createSession(user.id);
    return NextResponse.json({ id: user.id, employeeNo: user.employeeNo, name: user.name, role: user.role }, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json({ error: "登录失败，请稍后重试" }, { status: 500, headers: noStoreHeaders });
  }
}
