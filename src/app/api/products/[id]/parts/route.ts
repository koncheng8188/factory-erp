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

export async function GET(_request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "product.view",
    "part.view"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const parts = await prisma.productPart.findMany({
      where: { productId: id },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({ parts });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "查询部件失败。") }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "product.view",
    "part.view",
    "part.create"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const body = await request.json();
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, orderId: true, quantity: true }
    });

    if (!product) {
      return NextResponse.json({ error: "产品不存在。" }, { status: 404 });
    }

    const partName = typeof body.partName === "string" ? body.partName.trim() : "";
    const unitQuantity = parseQuantity(body.unitQuantity);
    const productQuantity = body.productQuantity === undefined || body.productQuantity === ""
      ? product.quantity
      : parseQuantity(body.productQuantity);

    if (!partName) {
      return NextResponse.json({ error: "部件名称不能为空。" }, { status: 400 });
    }
    if (unitQuantity <= 0) {
      return NextResponse.json({ error: "单套用量必须大于 0。" }, { status: 400 });
    }
    if (productQuantity <= 0) {
      return NextResponse.json({ error: "产品数量必须大于 0。" }, { status: 400 });
    }

    const totalQuantity = calculatePartTotalQuantity(unitQuantity, productQuantity);
    if (totalQuantity < 0) {
      return NextResponse.json({ error: "应加工数量不能为负数。" }, { status: 400 });
    }

    const part = await prisma.productPart.create({
      data: {
        orderId: product.orderId,
        productId: product.id,
        partName,
        partCode: normalizeOptional(body.partCode),
        specification: normalizeOptional(body.specification),
        material: normalizeOptional(body.material),
        unitQuantity,
        productQuantity,
        totalQuantity,
        surfaceTreatment: normalizeOptional(body.surfaceTreatment),
        color: normalizeOptional(body.color),
        outsourcedQuantity: 0,
        returnedQuantity: 0,
        missingQuantity: 0,
        status: "PENDING",
        remark: normalizeOptional(body.remark)
      }
    });

    return NextResponse.json({ part });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "新增部件失败。") }, { status: 500 });
  }
}
