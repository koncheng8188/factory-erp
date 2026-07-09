import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  canDeliverProduct,
  deliveredQuantityFromItems,
  formatDeliveryDate,
  missingDeliveryQuantity,
  normalizeOptional,
  parseDate
} from "@/lib/delivery";

type RawDeliveryItem = {
  productId?: unknown;
  deliveryQuantity?: unknown;
  remark?: unknown;
};

class BusinessError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BusinessError";
    this.status = status;
  }
}

function parseQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isInteger(quantity) ? quantity : Number.NaN;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET() {
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
  try {
    const body = await request.json();
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const deliveryDate = parseDate(body.deliveryDate);
    const rawItems: RawDeliveryItem[] = Array.isArray(body.items) ? body.items : [];

    if (!orderId) {
      return NextResponse.json({ error: "请选择订单。" }, { status: 400 });
    }

    const itemMap = new Map<string, { productId: string; deliveryQuantity: number; remark: string | null }>();
    for (const item of rawItems) {
      const productId = typeof item?.productId === "string" ? item.productId : "";
      const deliveryQuantity = parseQuantity(item?.deliveryQuantity);

      if (!productId) {
        return NextResponse.json({ error: "送货明细缺少产品。" }, { status: 400 });
      }
      if (!Number.isInteger(deliveryQuantity) || deliveryQuantity <= 0) {
        return NextResponse.json({ error: "本次送货数量必须是大于 0 的整数。" }, { status: 400 });
      }

      const existing = itemMap.get(productId);
      if (existing) {
        existing.deliveryQuantity += deliveryQuantity;
        existing.remark = existing.remark ?? normalizeOptional(item?.remark);
      } else {
        itemMap.set(productId, {
          productId,
          deliveryQuantity,
          remark: normalizeOptional(item?.remark)
        });
      }
    }

    if (itemMap.size === 0) {
      return NextResponse.json({ error: "请至少选择一条送货明细。" }, { status: 400 });
    }

    const deliveryOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          products: {
            include: {
              deliveryOrderItems: {
                select: {
                  deliveryQuantity: true
                }
              }
            }
          }
        }
      });

      if (!order) {
        throw new BusinessError("订单不存在。", 400);
      }
      if (order.status === "COMPLETED") {
        throw new BusinessError("订单已完成，不能继续创建送货单。", 409);
      }

      const productMap = new Map(order.products.map((product) => [product.id, product]));
      for (const item of itemMap.values()) {
        const product = productMap.get(item.productId);
        if (!product || product.orderId !== orderId) {
          throw new BusinessError("送货明细产品不属于当前订单。", 400);
        }
        const deliveredQuantity = deliveredQuantityFromItems(product.deliveryOrderItems);
        const missingQuantity = missingDeliveryQuantity(product.quantity, deliveredQuantity);
        if (!canDeliverProduct(product.status, missingQuantity)) {
          throw new BusinessError(`产品「${product.productName}」当前状态或未送数量不允许送货。`, 409);
        }
        if (item.deliveryQuantity > missingQuantity) {
          throw new BusinessError(`产品「${product.productName}」本次送货数量不能大于未送数量 ${missingQuantity}。`, 409);
        }
      }

      const prefix = `SH${formatDeliveryDate(deliveryDate)}`;
      const latestOrder = await tx.deliveryOrder.findFirst({
        where: { deliveryNo: { startsWith: prefix } },
        orderBy: { deliveryNo: "desc" },
        select: { deliveryNo: true }
      });
      const latestSerial = latestOrder ? Number(latestOrder.deliveryNo.slice(-3)) : 0;
      const deliveryNo = `${prefix}${String(latestSerial + 1).padStart(3, "0")}`;

      let createdOrder = await tx.deliveryOrder.create({
        data: {
          deliveryNo,
          orderId: order.id,
          customerId: order.customerId,
          customerName: order.customerName,
          deliveryDate,
          receiver: normalizeOptional(body.receiver),
          handler: normalizeOptional(body.handler),
          status: "PARTIAL_DELIVERED",
          remark: normalizeOptional(body.remark)
        }
      });

      for (const item of itemMap.values()) {
        const product = productMap.get(item.productId);
        if (!product) continue;

        await tx.deliveryOrderItem.create({
          data: {
            deliveryOrderId: createdOrder.id,
            orderId: order.id,
            productId: product.id,
            productName: product.productName,
            specification: product.specification,
            deliveryQuantity: item.deliveryQuantity,
            remark: item.remark
          }
        });
      }

      for (const productId of itemMap.keys()) {
        const product = productMap.get(productId);
        if (!product || product.status === "ABNORMAL" || product.status === "COMPLETED") {
          continue;
        }

        const aggregate = await tx.deliveryOrderItem.aggregate({
          where: { productId },
          _sum: { deliveryQuantity: true }
        });
        const deliveredQuantity = aggregate._sum.deliveryQuantity ?? 0;
        const status = deliveredQuantity < product.quantity ? "PARTIAL_DELIVERED" : "COMPLETED";

        await tx.product.update({
          where: { id: productId },
          data: { status }
        });
      }

      const refreshedProducts = await tx.product.findMany({
        where: { orderId: order.id },
        select: {
          status: true
        }
      });

      const allCompleted = refreshedProducts.length > 0 && refreshedProducts.every((product) => product.status === "COMPLETED");
      const hasDelivered = refreshedProducts.some((product) => product.status === "PARTIAL_DELIVERED" || product.status === "COMPLETED");
      const deliveryOrderStatus = allCompleted ? "DELIVERED" : "PARTIAL_DELIVERED";

      if (allCompleted) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "COMPLETED" }
        });
      } else if (hasDelivered) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "PARTIAL_DELIVERED" }
        });
      }

      createdOrder = await tx.deliveryOrder.update({
        where: { id: createdOrder.id },
        data: { status: deliveryOrderStatus }
      });

      return createdOrder;
    });

    return NextResponse.json({ deliveryOrder });
  } catch (error) {
    if (error instanceof BusinessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("创建送货单失败", error);
    return NextResponse.json({ error: errorMessage(error, "创建送货单失败。") }, { status: 500 });
  }
}
