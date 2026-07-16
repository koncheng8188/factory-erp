import { NextRequest, NextResponse } from "next/server";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isInteger(quantity) ? quantity : 0;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "product.view",
    "product.create"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const body = await request.json();
    const productName = typeof body.productName === "string" ? body.productName.trim() : "";
    const quantity = parseQuantity(body.quantity);

    if (!productName) {
      return NextResponse.json({ error: "产品名称不能为空。" }, { status: 400 });
    }
    if (quantity <= 0) {
      return NextResponse.json({ error: "产品数量必须大于 0。" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id }, select: { id: true } });
    if (!order) {
      return NextResponse.json({ error: "订单不存在。" }, { status: 404 });
    }

    const product = await prisma.product.create({
      data: {
        orderId: id,
        productName,
        specification: normalizeOptional(body.specification),
        material: normalizeOptional(body.material),
        quantity,
        surfaceTreatment: normalizeOptional(body.surfaceTreatment),
        status: "PENDING",
        remark: normalizeOptional(body.remark)
      }
    });

    return NextResponse.json({ product });
  } catch {
    return NextResponse.json({ error: "新增产品失败。" }, { status: 500 });
  }
}
