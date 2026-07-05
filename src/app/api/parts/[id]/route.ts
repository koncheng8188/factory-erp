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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const partName = typeof body.partName === "string" ? body.partName.trim() : "";
    const unitQuantity = parseQuantity(body.unitQuantity);
    const productQuantity = parseQuantity(body.productQuantity);

    if (!partName) {
      return NextResponse.json({ error: "部件名称不能为空。" }, { status: 400 });
    }
    if (unitQuantity <= 0) {
      return NextResponse.json({ error: "单套用量必须大于 0。" }, { status: 400 });
    }
    if (productQuantity <= 0) {
      return NextResponse.json({ error: "产品数量必须大于 0。" }, { status: 400 });
    }

    const totalQuantity = unitQuantity * productQuantity;
    if (totalQuantity < 0) {
      return NextResponse.json({ error: "应加工数量不能为负数。" }, { status: 400 });
    }

    const existingPart = await prisma.productPart.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!existingPart) {
      return NextResponse.json({ error: "部件不存在。" }, { status: 404 });
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
    return NextResponse.json({ error: errorMessage(error, "保存部件失败。") }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await prisma.productPart.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "删除部件失败。") }, { status: 500 });
  }
}
