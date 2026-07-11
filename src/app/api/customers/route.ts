import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth/api-user";

function normalizeOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "客户名称不能为空。" }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        contact: normalizeOptional(body.contact),
        phone: normalizeOptional(body.phone),
        address: normalizeOptional(body.address),
        remark: normalizeOptional(body.remark)
      }
    });

    return NextResponse.json({ customer });
  } catch {
    return NextResponse.json({ error: "新增客户失败。" }, { status: 500 });
  }
}
