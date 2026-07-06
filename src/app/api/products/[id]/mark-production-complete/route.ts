import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const readyForDeliveryStatuses = new Set(["WAIT_DELIVERY", "PARTIAL_DELIVERED", "COMPLETED"]);
const protectedOrderStatuses = new Set(["PARTIAL_DELIVERED", "COMPLETED", "ABNORMAL"]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id },
        select: {
          id: true,
          orderId: true,
          status: true,
          parts: {
            select: {
              id: true,
              totalQuantity: true,
              outsourcedQuantity: true,
              returnedQuantity: true,
              status: true
            }
          }
        }
      });

      if (!product) {
        throw new Error("\u4ea7\u54c1\u4e0d\u5b58\u5728");
      }

      if (product.parts.length === 0) {
        throw new Error("\u8bf7\u5148\u7ef4\u62a4\u90e8\u4ef6\u6216\u8bbe\u4e3a\u6574\u4ef6\u4ea7\u54c1");
      }

      if (product.status === "ABNORMAL") {
        throw new Error("\u5f02\u5e38\u4ea7\u54c1\u4e0d\u80fd\u6807\u8bb0\u751f\u4ea7\u5b8c\u6210");
      }

      if (product.status === "PARTIAL_DELIVERED" || product.status === "COMPLETED") {
        throw new Error("\u4ea7\u54c1\u5df2\u8fdb\u5165\u9001\u8d27\u6216\u5b8c\u6210\u72b6\u6001\uff0c\u4e0d\u80fd\u91cd\u590d\u6807\u8bb0\u751f\u4ea7\u5b8c\u6210");
      }

      if (product.parts.some((part) => part.status === "ABNORMAL")) {
        throw new Error("\u5b58\u5728\u5f02\u5e38\u90e8\u4ef6\uff0c\u4e0d\u80fd\u6807\u8bb0\u751f\u4ea7\u5b8c\u6210");
      }

      if (product.parts.some((part) => part.outsourcedQuantity > part.returnedQuantity)) {
        throw new Error("\u5b58\u5728\u5916\u53d1\u672a\u56de\u90e8\u4ef6\uff0c\u4e0d\u80fd\u6807\u8bb0\u751f\u4ea7\u5b8c\u6210");
      }

      await Promise.all(
        product.parts.map((part) =>
          tx.productPart.update({
            where: { id: part.id },
            data: {
              returnedQuantity: part.totalQuantity,
              missingQuantity: 0,
              status: "RETURNED"
            }
          })
        )
      );

      await tx.product.update({
        where: { id: product.id },
        data: { status: "WAIT_DELIVERY" }
      });

      const [order, orderProducts] = await Promise.all([
        tx.order.findUnique({
          where: { id: product.orderId },
          select: { id: true, status: true }
        }),
        tx.product.findMany({
          where: { orderId: product.orderId },
          select: { status: true }
        })
      ]);

      if (!order) {
        return;
      }

      const allProductsReady = orderProducts.every((orderProduct) => readyForDeliveryStatuses.has(orderProduct.status));
      if (allProductsReady && !protectedOrderStatuses.has(order.status)) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "WAIT_DELIVERY" }
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(errorMessage(error, "\u6807\u8bb0\u751f\u4ea7\u5b8c\u6210\u5931\u8d25"));
  }
}
