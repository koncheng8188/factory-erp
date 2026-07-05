import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deliveryOrder = await prisma.deliveryOrder.findFirst({
      where: {
        OR: [{ id }, { deliveryNo: id }]
      },
      include: {
        order: {
          select: {
            orderNo: true
          }
        },
        items: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!deliveryOrder) {
      return NextResponse.json({ error: "送货单不存在。" }, { status: 404 });
    }

    return NextResponse.json({ deliveryOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "查询送货单详情失败。") }, { status: 500 });
  }
}
