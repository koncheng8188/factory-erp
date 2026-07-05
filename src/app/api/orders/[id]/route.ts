import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const allowedStatuses = new Set(["PENDING", "PRODUCING", "OUTSOURCING", "WAIT_DELIVERY", "PARTIAL_DELIVERED", "COMPLETED", "ABNORMAL"]);

function normalizeOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDate(value: unknown, fallback = new Date()) {
  if (typeof value !== "string" || !value) {
    return fallback;
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const customerId = typeof body.customerId === "string" ? body.customerId : "";
    const status = typeof body.status === "string" && allowedStatuses.has(body.status) ? body.status : "PENDING";

    if (!customerId) {
      return NextResponse.json({ error: "订单必须选择客户。" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: "选择的客户不存在。" }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { id },
      data: {
        customerId,
        customerName: customer.name,
        orderDate: parseDate(body.orderDate),
        deliveryDate: typeof body.deliveryDate === "string" && body.deliveryDate ? parseDate(body.deliveryDate) : null,
        status,
        remark: normalizeOptional(body.remark)
      }
    });

    return NextResponse.json({ order });
  } catch {
    return NextResponse.json({ error: "保存订单失败。" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await prisma.$transaction([
      prisma.product.deleteMany({ where: { orderId: id } }),
      prisma.order.delete({ where: { id } })
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "删除订单失败。" }, { status: 500 });
  }
}
