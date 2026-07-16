import { NextRequest, NextResponse } from "next/server";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { calculatePartTotalQuantity } from "@/lib/product-parts";

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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isForeignKeyConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
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
    const unitQuantity = parseQuantity(body.unitQuantity);
    const productQuantity = parseQuantity(body.productQuantity);

    if (!partName) {
      return NextResponse.json({ error: "\u90e8\u4ef6\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a\u3002" }, { status: 400 });
    }
    if (unitQuantity <= 0) {
      return NextResponse.json({ error: "\u5355\u5957\u7528\u91cf\u5fc5\u987b\u5927\u4e8e 0\u3002" }, { status: 400 });
    }
    if (productQuantity <= 0) {
      return NextResponse.json({ error: "\u4ea7\u54c1\u6570\u91cf\u5fc5\u987b\u5927\u4e8e 0\u3002" }, { status: 400 });
    }

    const totalQuantity = calculatePartTotalQuantity(unitQuantity, productQuantity);
    if (totalQuantity < 0) {
      return NextResponse.json({ error: "\u5e94\u52a0\u5de5\u6570\u91cf\u4e0d\u80fd\u4e3a\u8d1f\u6570\u3002" }, { status: 400 });
    }

    const existingPart = await prisma.productPart.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!existingPart) {
      return NextResponse.json({ error: "\u90e8\u4ef6\u4e0d\u5b58\u5728\u3002" }, { status: 404 });
    }

    const part = await prisma.productPart.update({
      where: { id },
      data: {
        partName,
        partCode: normalizeOptional(body.partCode),
        specification: normalizeOptional(body.specification),
        material: normalizeOptional(body.material),
        unitQuantity,
        productQuantity,
        totalQuantity,
        surfaceTreatment: normalizeOptional(body.surfaceTreatment),
        color: normalizeOptional(body.color),
        remark: normalizeOptional(body.remark)
      }
    });

    return NextResponse.json({ part });
  } catch (error) {
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
      return NextResponse.json({ error: "\u8be5\u90e8\u4ef6\u5df2\u6709\u56fe\u7eb8\u3001\u5916\u53d1\u6216\u56de\u5382\u8bb0\u5f55\uff0c\u4e0d\u80fd\u5220\u9664" }, { status: 400 });
    }

    await prisma.productPart.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isForeignKeyConstraintError(error)) {
      return NextResponse.json({ error: "\u8be5\u90e8\u4ef6\u5df2\u6709\u4e1a\u52a1\u8bb0\u5f55\uff0c\u4e0d\u80fd\u5220\u9664" }, { status: 400 });
    }

    return NextResponse.json({ error: errorMessage(error, "\u5220\u9664\u90e8\u4ef6\u5931\u8d25") }, { status: 500 });
  }
}
