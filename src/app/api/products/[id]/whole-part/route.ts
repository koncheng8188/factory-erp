import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const blockedProductStatuses = new Set(["ABNORMAL", "WAIT_DELIVERY", "PARTIAL_DELIVERED", "COMPLETED"]);

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        specification: true,
        material: true,
        quantity: true,
        surfaceTreatment: true,
        status: true,
        _count: { select: { parts: true } }
      }
    });

    if (!product) {
      return NextResponse.json({ error: "产品不存在" }, { status: 404 });
    }

    if (product._count.parts > 0) {
      return NextResponse.json({ error: "该产品已有部件，不能设为整件产品" }, { status: 400 });
    }

    if (blockedProductStatuses.has(product.status)) {
      return NextResponse.json({ error: `产品状态为 ${product.status}，不能设为整件产品` }, { status: 400 });
    }

    await prisma.productPart.create({
      data: {
        orderId: product.orderId,
        productId: product.id,
        partName: "整件",
        partCode: null,
        specification: product.specification,
        material: product.material,
        unitQuantity: 1,
        productQuantity: product.quantity,
        totalQuantity: product.quantity,
        surfaceTreatment: product.surfaceTreatment,
        color: null,
        outsourcedQuantity: 0,
        returnedQuantity: 0,
        missingQuantity: 0,
        status: "PENDING",
        remark: "整件产品，不拆部件"
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "设为整件产品失败") }, { status: 500 });
  }
}
