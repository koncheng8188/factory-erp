import { NextRequest, NextResponse } from "next/server";
import type { OrderStatus, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeOptional, parseDate } from "@/lib/outsource";
import { syncProductStatusFromParts } from "@/lib/product-progress";
import { resolveOutsourceItemStatus, resolvePartStatus } from "@/lib/returns";

type RawReturnItem = {
  outsourceOrderItemId?: unknown;
  returnQuantity?: unknown;
  abnormalQuantity?: unknown;
  abnormalReason?: unknown;
  remark?: unknown;
};

function parseQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isInteger(quantity) ? quantity : Number.NaN;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const nonRegressiveProductStatusList: ProductStatus[] = ["PARTIAL_DELIVERED", "COMPLETED"];
const nonRegressiveOrderStatusList: OrderStatus[] = ["PARTIAL_DELIVERED", "COMPLETED"];
const deliveryReadyProductStatusList: ProductStatus[] = ["WAIT_DELIVERY", "PARTIAL_DELIVERED", "COMPLETED"];
const protectedDeliveryOrderStatusList: OrderStatus[] = ["ABNORMAL", "PARTIAL_DELIVERED", "COMPLETED"];

export async function GET() {
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
  try {
    const body = await request.json();
    const outsourceOrderId = typeof body.outsourceOrderId === "string" ? body.outsourceOrderId : "";
    const returnDate = parseDate(body.returnDate);
    const rawItems: RawReturnItem[] = Array.isArray(body.items) ? body.items : [];

    if (!outsourceOrderId) {
      return NextResponse.json({ error: "缺少外发单。 " }, { status: 400 });
    }

    const itemInputs = rawItems
      .map((item) => ({
        outsourceOrderItemId: typeof item?.outsourceOrderItemId === "string" ? item.outsourceOrderItemId : "",
        returnQuantity: parseQuantity(item?.returnQuantity),
        abnormalQuantity: item?.abnormalQuantity === "" || item?.abnormalQuantity === undefined ? 0 : parseQuantity(item?.abnormalQuantity),
        abnormalReason: normalizeOptional(item?.abnormalReason),
        remark: normalizeOptional(item?.remark)
      }))
      .filter((item) => item.returnQuantity > 0);

    if (itemInputs.length === 0) {
      return NextResponse.json({ error: "请至少填写一条本次回来数量大于 0 的明细。" }, { status: 400 });
    }

    const duplicateIds = new Set<string>();
    for (const item of itemInputs) {
      if (!item.outsourceOrderItemId) {
        return NextResponse.json({ error: "回厂明细缺少外发明细。" }, { status: 400 });
      }
      if (duplicateIds.has(item.outsourceOrderItemId)) {
        return NextResponse.json({ error: "同一外发明细不能重复提交。" }, { status: 400 });
      }
      duplicateIds.add(item.outsourceOrderItemId);
      if (!Number.isInteger(item.returnQuantity) || item.returnQuantity < 0) {
        return NextResponse.json({ error: "本次回来数量必须是大于等于 0 的整数。" }, { status: 400 });
      }
      if (!Number.isInteger(item.abnormalQuantity) || item.abnormalQuantity < 0) {
        return NextResponse.json({ error: "异常数量必须是大于等于 0 的整数。" }, { status: 400 });
      }
      if (item.abnormalQuantity > item.returnQuantity) {
        return NextResponse.json({ error: "异常数量不能大于本次回来数量。" }, { status: 400 });
      }
      if (item.abnormalQuantity > 0 && !item.abnormalReason) {
        return NextResponse.json({ error: "有异常数量时必须填写异常原因。" }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const outsourceOrder = await tx.outsourceOrder.findUnique({
        where: { id: outsourceOrderId },
        include: {
          items: {
            include: {
              returnItems: {
                select: {
                  abnormalQuantity: true
                }
              }
            }
          }
        }
      });

      if (!outsourceOrder) {
        throw new Error("外发单不存在。");
      }

      const orderItemMap = new Map(outsourceOrder.items.map((item) => [item.id, item]));

      for (const item of itemInputs) {
        const orderItem = orderItemMap.get(item.outsourceOrderItemId);
        if (!orderItem || orderItem.outsourceOrderId !== outsourceOrderId) {
          throw new Error("回厂明细不属于当前外发单。");
        }
        if (orderItem.missingQuantity <= 0) {
          throw new Error(`部件「${orderItem.partName}」已经全部回齐，不能继续登记。`);
        }
        if (item.returnQuantity > orderItem.missingQuantity) {
          throw new Error(`部件「${orderItem.partName}」本次回来数量不能大于未回数量 ${orderItem.missingQuantity}。`);
        }
      }

      const outsourceReturn = await tx.outsourceReturn.create({
        data: {
          outsourceOrderId,
          returnDate,
          handler: normalizeOptional(body.handler),
          remark: normalizeOptional(body.remark)
        }
      });

      const affectedPartIds = new Set<string>();
      const affectedProductIds = new Set<string>();
      const abnormalProductIds = new Set<string>();
      const abnormalOrderIds = new Set<string>();
      for (const item of itemInputs) {
        const orderItem = orderItemMap.get(item.outsourceOrderItemId);
        if (!orderItem) continue;

        await tx.outsourceReturnItem.create({
          data: {
            outsourceReturnId: outsourceReturn.id,
            outsourceOrderItemId: orderItem.id,
            partId: orderItem.partId,
            returnQuantity: item.returnQuantity,
            abnormalQuantity: item.abnormalQuantity,
            abnormalReason: item.abnormalReason,
            remark: item.remark
          }
        });

        const nextReturnedQuantity = orderItem.returnedQuantity + item.returnQuantity;
        const nextMissingQuantity = orderItem.outsourceQuantity - nextReturnedQuantity;
        const hasHistoryAbnormal = orderItem.status === "ABNORMAL" || orderItem.returnItems.some((returnItem) => returnItem.abnormalQuantity > 0);
        const status = resolveOutsourceItemStatus({
          outsourceQuantity: orderItem.outsourceQuantity,
          returnedQuantity: nextReturnedQuantity,
          hasAbnormal: hasHistoryAbnormal || item.abnormalQuantity > 0
        });

        if (item.abnormalQuantity > 0) {
          abnormalProductIds.add(orderItem.productId);
          abnormalOrderIds.add(orderItem.orderId);
        }

        await tx.outsourceOrderItem.update({
          where: { id: orderItem.id },
          data: {
            returnedQuantity: nextReturnedQuantity,
            missingQuantity: nextMissingQuantity,
            status
          }
        });

        affectedPartIds.add(orderItem.partId);
      }

      for (const partId of affectedPartIds) {
        const part = await tx.productPart.findUnique({
          where: { id: partId },
          include: {
            outsourceReturnItems: {
              select: {
                abnormalQuantity: true
              }
            }
          }
        });
        if (!part) continue;
        affectedProductIds.add(part.productId);

        const addedReturnQuantity = itemInputs.reduce((sum, item) => {
          const orderItem = orderItemMap.get(item.outsourceOrderItemId);
          return orderItem?.partId === partId ? sum + item.returnQuantity : sum;
        }, 0);
        const nextReturnedQuantity = part.returnedQuantity + addedReturnQuantity;
        const nextMissingQuantity = part.outsourcedQuantity - nextReturnedQuantity;
        const hasCurrentAbnormal = itemInputs.some((item) => {
          const orderItem = orderItemMap.get(item.outsourceOrderItemId);
          return orderItem?.partId === partId && item.abnormalQuantity > 0;
        });
        const hasHistoryAbnormal = part.status === "ABNORMAL" || part.outsourceReturnItems.some((returnItem) => returnItem.abnormalQuantity > 0);

        await tx.productPart.update({
          where: { id: partId },
          data: {
            returnedQuantity: nextReturnedQuantity,
            missingQuantity: nextMissingQuantity,
            status: resolvePartStatus({
              outsourcedQuantity: part.outsourcedQuantity,
              returnedQuantity: nextReturnedQuantity,
              hasAbnormal: hasHistoryAbnormal || hasCurrentAbnormal
            })
          }
        });
      }

      if (abnormalProductIds.size > 0) {
        await tx.product.updateMany({
          where: {
            id: { in: Array.from(abnormalProductIds) },
            status: { notIn: nonRegressiveProductStatusList }
          },
          data: { status: "ABNORMAL" }
        });
      }

      if (abnormalOrderIds.size > 0) {
        await tx.order.updateMany({
          where: {
            id: { in: Array.from(abnormalOrderIds) },
            status: { notIn: nonRegressiveOrderStatusList }
          },
          data: { status: "ABNORMAL" }
        });
      }

      const refreshedItems = await tx.outsourceOrderItem.findMany({
        where: { outsourceOrderId },
        select: {
          status: true,
          returnedQuantity: true,
          outsourceQuantity: true
        }
      });
      const hasAbnormal = refreshedItems.some((item) => item.status === "ABNORMAL");
      const allReturned = refreshedItems.length > 0 && refreshedItems.every((item) => item.status === "RETURNED");
      const hasReturned = refreshedItems.some((item) => item.returnedQuantity > 0);
      const orderStatus = hasAbnormal ? "ABNORMAL" : allReturned ? "RETURNED" : hasReturned ? "PARTIAL_RETURN" : "OUTSOURCED";

      await tx.outsourceOrder.update({
        where: { id: outsourceOrderId },
        data: {
          status: orderStatus,
          actualReturnDate: allReturned && !hasAbnormal ? returnDate : outsourceOrder.actualReturnDate
        }
      });

      for (const productId of affectedProductIds) {
        await syncProductStatusFromParts(tx, productId);
      }

      const affectedOrderIds = new Set(outsourceOrder.items.map((item) => item.orderId));
      for (const orderId of affectedOrderIds) {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            status: true,
            products: {
              select: {
                status: true
              }
            }
          }
        });

        if (!order || protectedDeliveryOrderStatusList.includes(order.status)) {
          continue;
        }

        const allProductsReadyForDelivery =
          order.products.length > 0 && order.products.every((product) => deliveryReadyProductStatusList.includes(product.status));

        if (allProductsReadyForDelivery) {
          await tx.order.update({
            where: { id: orderId },
            data: { status: "WAIT_DELIVERY" }
          });
        }
      }

      return outsourceReturn;
    });

    return NextResponse.json({ outsourceReturn: result });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "保存回厂记录失败。") }, { status: 500 });
  }
}
