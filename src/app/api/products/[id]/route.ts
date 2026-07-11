import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth/api-user";

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

const protectedProductDeleteMessage = "该产品已有图纸、生产、外发、回厂、送货或异常记录，不能直接删除。";

export async function PUT(request: NextRequest, context: RouteContext) {
  const authResult = await requireApiUser();
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
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!product) {
      return NextResponse.json({ error: "产品不存在。" }, { status: 404 });
    }

    const [
      drawingCount,
      progressLogCount,
      abnormalCount,
      outsourceItemCount,
      returnItemCount,
      deliveryItemCount,
      progressedPartCount
    ] = await Promise.all([
      prisma.partDrawing.count({ where: { productId: id } }),
      prisma.productPartProgressLog.count({ where: { productId: id } }),
      prisma.productPartAbnormal.count({ where: { productId: id } }),
      prisma.outsourceOrderItem.count({ where: { productId: id } }),
      prisma.outsourceReturnItem.count({ where: { part: { productId: id } } }),
      prisma.deliveryOrderItem.count({ where: { productId: id } }),
      prisma.productPart.count({
        where: {
          productId: id,
          OR: [{ outsourcedQuantity: { gt: 0 } }, { returnedQuantity: { gt: 0 } }, { missingQuantity: { gt: 0 } }]
        }
      })
    ]);

    const hasBusinessRecords =
      drawingCount > 0 ||
      progressLogCount > 0 ||
      abnormalCount > 0 ||
      outsourceItemCount > 0 ||
      returnItemCount > 0 ||
      deliveryItemCount > 0 ||
      progressedPartCount > 0;

    if (hasBusinessRecords) {
      return NextResponse.json({ error: protectedProductDeleteMessage }, { status: 409 });
    }

    await prisma.$transaction([
      prisma.productPart.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } })
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "删除产品失败。" }, { status: 500 });
  }
}
