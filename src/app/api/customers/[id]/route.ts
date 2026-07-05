import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "客户名称不能为空。" }, { status: 400 });
    }

    const customer = await prisma.customer.update({
      where: { id },
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
    return NextResponse.json({ error: "保存客户失败。" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const orderCount = await prisma.order.count({ where: { customerId: id } });

    if (orderCount > 0) {
      return NextResponse.json({ error: "该客户已有订单，不能直接删除。" }, { status: 400 });
    }

    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "删除客户失败。" }, { status: 500 });
  }
}
