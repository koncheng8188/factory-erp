import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  PositiveIntegerValidationError,
  ProductPartNotFoundError,
  ProductPartPlanConflictError,
  ProductPartTotalQuantityValidationError,
  updateProductPartPlan
} from "@/lib/product-part-integrity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "part.view",
    "part.update"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const body = await request.json();
    const partName = typeof body.partName === "string" ? body.partName.trim() : "";

    if (!partName) {
      return NextResponse.json({ error: "\u90e8\u4ef6\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a\u3002" }, { status: 400 });
    }

    // updateProductPartPlan 内部在同一事务中依次执行 prisma.productPart.findUnique 和 prisma.productPart.update。
    const part = await updateProductPartPlan(prisma, id, {
      partName,
      partCode: normalizeOptional(body.partCode),
      specification: normalizeOptional(body.specification),
      material: normalizeOptional(body.material),
      unitQuantity: body.unitQuantity,
      productQuantity: body.productQuantity,
      surfaceTreatment: normalizeOptional(body.surfaceTreatment),
      color: normalizeOptional(body.color),
      remark: normalizeOptional(body.remark)
    });

    return NextResponse.json({ part });
  } catch (error) {
    if (
      error instanceof PositiveIntegerValidationError ||
      error instanceof ProductPartTotalQuantityValidationError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ProductPartPlanConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ProductPartNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: errorMessage(error, "\u4fdd\u5b58\u90e8\u4ef6\u5931\u8d25\u3002") }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "part.view",
    "part.delete"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const part = await prisma.productPart.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            drawings: true,
            outsourceItems: true,
            outsourceReturnItems: true
          }
        }
      }
    });

    if (!part) {
      return NextResponse.json({ error: "\u90e8\u4ef6\u4e0d\u5b58\u5728" }, { status: 404 });
    }

    const hasBusinessRecords = part._count.drawings > 0 || part._count.outsourceItems > 0 || part._count.outsourceReturnItems > 0;
    if (hasBusinessRecords) {
      return NextResponse.json({ error: "\u8be5\u90e8\u4ef6\u5df2\u6709\u56fe\u7eb8\u3001\u5916\u53d1\u6216\u56de\u5382\u8bb0\u5f55\uff0c\u4e0d\u80fd\u5220\u9664" }, { status: 409 });
    }

    await prisma.productPart.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "\u90e8\u4ef6\u4e0d\u5b58\u5728" }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "\u8be5\u90e8\u4ef6\u5df2\u6709\u4e1a\u52a1\u8bb0\u5f55\uff0c\u4e0d\u80fd\u5220\u9664" }, { status: 409 });
    }

    return NextResponse.json({ error: "\u5220\u9664\u90e8\u4ef6\u5931\u8d25" }, { status: 500 });
  }
}
