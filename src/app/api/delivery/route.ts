import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDeliveryIntegrity, DeliveryIntegrityError } from "@/lib/delivery-integrity";
import { requireApiAllPermissions, requireApiPermission } from "@/lib/auth/authorization";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
  const authResult = await requireApiPermission("delivery.view");
  if (!authResult.ok) return authResult.response;
  try {
    const deliveryOrders = await prisma.deliveryOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          select: {
            orderNo: true
          }
        },
        _count: {
          select: {
            items: true
          }
        }
      }
    });

    return NextResponse.json({ deliveryOrders });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "查询送货单失败。") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "product.view",
    "delivery.view",
    "delivery.create"
  ]);
  if (!authResult.ok) return authResult.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误。" }, { status: 400 });
  }
  try {
    const deliveryOrder = await createDeliveryIntegrity({ client: prisma, input: body });

    return NextResponse.json({ deliveryOrder });
  } catch (error) {
    if (error instanceof DeliveryIntegrityError) {
      return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    }
    console.error("创建送货单失败", error);
    return NextResponse.json({ error: "创建送货单失败，请稍后重试。" }, { status: 500 });
  }
}
