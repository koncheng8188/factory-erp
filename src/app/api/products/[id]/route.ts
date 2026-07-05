import { NextRequest, NextResponse } from "next/server";
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

export async function PUT(request: NextRequest, context: RouteContext) {
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

    const product = await prisma.product.update({
      where: { id },
      data: {
        productName,
        specification: normalizeOptional(body.specification),
        material: normalizeOptional(body.material),
        quantity,
        surfaceTreatment: normalizeOptional(body.surfaceTreatment),
        remark: normalizeOptional(body.remark)
      }
    });

    return NextResponse.json({ product });
  } catch {
    return NextResponse.json({ error: "保存产品失败。" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await prisma.$transaction([
      prisma.productPart.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } })
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "删除产品失败。" }, { status: 500 });
  }
}
