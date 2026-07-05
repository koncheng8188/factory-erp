import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

function formatOrderDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function generateOrderNo(orderDate: Date) {
  const prefix = `DD${formatOrderDate(orderDate)}`;
  const latestOrder = await prisma.order.findFirst({
    where: { orderNo: { startsWith: prefix } },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true }
  });
  const latestSerial = latestOrder ? Number(latestOrder.orderNo.slice(-3)) : 0;
  return `${prefix}${String(latestSerial + 1).padStart(3, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const customerId = typeof body.customerId === "string" ? body.customerId : "";

    if (!customerId) {
      return NextResponse.json({ error: "订单必须选择客户。" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: "选择的客户不存在。" }, { status: 400 });
    }

    const orderDate = parseDate(body.orderDate);
    const deliveryDate = typeof body.deliveryDate === "string" && body.deliveryDate ? parseDate(body.deliveryDate) : null;
    const orderNo = await generateOrderNo(orderDate);

    const order = await prisma.order.create({
      data: {
        orderNo,
        customerId,
        customerName: customer.name,
        orderDate,
        deliveryDate,
        status: "PENDING",
        remark: normalizeOptional(body.remark)
      }
    });

    return NextResponse.json({ order });
  } catch {
    return NextResponse.json({ error: "新增订单失败。" }, { status: 500 });
  }
}
