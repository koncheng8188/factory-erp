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

const protectedOrderDeleteMessage =
  "该订单已有图纸、生产、外发、回厂、送货或异常记录，不能直接删除。请先确认业务记录后再处理。";

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
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在。" }, { status: 404 });
    }

    const [
      drawingCount,
      progressLogCount,
      abnormalCount,
      outsourceOrderCount,
      outsourceItemCount,
      returnItemCount,
      deliveryOrderCount,
      deliveryItemCount,
      progressedPartCount
    ] = await Promise.all([
      prisma.partDrawing.count({ where: { orderId: id } }),
      prisma.productPartProgressLog.count({ where: { orderId: id } }),
      prisma.productPartAbnormal.count({ where: { orderId: id } }),
      prisma.outsourceOrder.count({ where: { items: { some: { orderId: id } } } }),
      prisma.outsourceOrderItem.count({ where: { orderId: id } }),
      prisma.outsourceReturnItem.count({ where: { outsourceOrderItem: { orderId: id } } }),
      prisma.deliveryOrder.count({ where: { orderId: id } }),
      prisma.deliveryOrderItem.count({ where: { orderId: id } }),
      prisma.productPart.count({
        where: {
          orderId: id,
          OR: [{ outsourcedQuantity: { gt: 0 } }, { returnedQuantity: { gt: 0 } }, { missingQuantity: { gt: 0 } }]
        }
      })
    ]);

    const hasBusinessRecords =
      drawingCount > 0 ||
      progressLogCount > 0 ||
      abnormalCount > 0 ||
      outsourceOrderCount > 0 ||
      outsourceItemCount > 0 ||
      returnItemCount > 0 ||
      deliveryOrderCount > 0 ||
      deliveryItemCount > 0 ||
      progressedPartCount > 0;

    if (hasBusinessRecords) {
      return NextResponse.json({ error: protectedOrderDeleteMessage }, { status: 409 });
    }

    await prisma.$transaction([
      prisma.productPart.deleteMany({ where: { orderId: id } }),
      prisma.product.deleteMany({ where: { orderId: id } }),
      prisma.order.delete({ where: { id } })
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "删除订单失败。" }, { status: 500 });
  }
}
