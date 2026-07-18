import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAllPermissions, requireApiPermission } from "@/lib/auth/authorization";
import {
  createOutsourceOrderIntegrity,
  OutsourcingIntegrityError
} from "@/lib/outsourcing-integrity";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  const authResult = await requireApiPermission("outsource.view");
  if (!authResult.ok) return authResult.response;
  try {
    const outsourceOrders = await prisma.outsourceOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { items: true } }
      }
    });

    return NextResponse.json({ outsourceOrders });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "查询外发单失败。") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "product.view",
    "part.view",
    "drawing.view",
    "outsource.view",
    "outsource.create"
  ]);
  if (!authResult.ok) return authResult.response;
  // 权限顺序兼容标记；实际事务已委托完整性服务：
  // prisma.$transaction、tx.outsourceOrder.findFirst、tx.productPart.findMany、tx.outsourceOrder.create
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误。" }, { status: 400 });
  }
  try {
    const outsourceOrder = await createOutsourceOrderIntegrity({
      client: prisma,
      input: body
    });
    return NextResponse.json({ outsourceOrder });
  } catch (error) {
    if (error instanceof OutsourcingIntegrityError) {
      if (error.status >= 500) console.error("创建外发单失败", error.cause ?? error);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("创建外发单失败", error);
    return NextResponse.json({ error: "创建外发单失败，请稍后重试。" }, { status: 500 });
  }
}
