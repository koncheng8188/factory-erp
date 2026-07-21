import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOutsourceReturnIntegrity, ReturnsIntegrityError } from "@/lib/returns-integrity";
import { requireApiAllPermissions, requireApiPermission } from "@/lib/auth/authorization";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  const authResult = await requireApiPermission("return.view");
  if (!authResult.ok) return authResult.response;
  try {
    const returns = await prisma.outsourceReturn.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        outsourceOrder: {
          select: {
            id: true,
            outsourceNo: true,
            supplierName: true,
            outsourceType: true,
            status: true
          }
        },
        items: {
          select: {
            returnQuantity: true,
            abnormalQuantity: true
          }
        }
      }
    });

    return NextResponse.json({ returns });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "查询回厂记录失败。") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "product.view",
    "part.view",
    "outsource.view",
    "return.view",
    "return.create"
  ]);
  if (!authResult.ok) return authResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("解析回厂请求失败", error);
    return NextResponse.json({ error: "请求格式错误。" }, { status: 400 });
  }

  try {
    const outsourceReturn = await createOutsourceReturnIntegrity({ client: prisma, input: body });
    return NextResponse.json({ outsourceReturn });
  } catch (error) {
    if (error instanceof ReturnsIntegrityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("保存回厂记录失败", error);
    return NextResponse.json({ error: "保存回厂记录失败，请稍后重试。" }, { status: 500 });
  }
}
