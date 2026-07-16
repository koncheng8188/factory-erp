import { NextRequest, NextResponse } from "next/server";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  calculateProductPartTotalQuantity as calculatePartTotalQuantity,
  parseStrictPositiveInteger,
  PositiveIntegerValidationError,
  ProductPartTotalQuantityValidationError
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
    const unitQuantity = parseStrictPositiveInteger(body.unitQuantity, "单套用量");
    const productQuantity = parseStrictPositiveInteger(
      body.productQuantity === undefined ? product.quantity : body.productQuantity,
      "产品数量"
    );

    if (!partName) {
      return NextResponse.json({ error: "部件名称不能为空。" }, { status: 400 });
    }

    const totalQuantity = calculatePartTotalQuantity(unitQuantity, productQuantity);

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
    if (
      error instanceof PositiveIntegerValidationError ||
      error instanceof ProductPartTotalQuantityValidationError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: errorMessage(error, "新增部件失败。") }, { status: 500 });
  }
}
