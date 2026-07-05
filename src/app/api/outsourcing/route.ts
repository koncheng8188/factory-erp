import { NextRequest, NextResponse } from "next/server";
import type { OrderStatus, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  formatOutsourceDate,
  isOutsourceType,
  normalizeOptional,
  parseDate,
  pickOutsourceDrawing
} from "@/lib/outsource";

function parseQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isInteger(quantity) ? quantity : 0;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const blockedOutsourceProductStatusList: ProductStatus[] = ["ABNORMAL", "WAIT_DELIVERY", "PARTIAL_DELIVERED", "COMPLETED"];
const blockedOutsourceOrderStatusList: OrderStatus[] = ["ABNORMAL", "WAIT_DELIVERY", "PARTIAL_DELIVERED", "COMPLETED"];
const blockedOutsourceProductStatuses = new Set<ProductStatus>(blockedOutsourceProductStatusList);
const blockedOutsourceOrderStatuses = new Set<OrderStatus>(blockedOutsourceOrderStatusList);

export async function GET() {
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
  try {
    const body = await request.json();
    const supplierName = typeof body.supplierName === "string" ? body.supplierName.trim() : "";
    const outsourceType = isOutsourceType(body.outsourceType) ? body.outsourceType : "ELECTROPLATING";
    const outsourceDate = parseDate(body.outsourceDate);
    const expectedReturnDate = typeof body.expectedReturnDate === "string" && body.expectedReturnDate
      ? parseDate(body.expectedReturnDate)
      : null;
    const items = Array.isArray(body.items) ? body.items : [];

    if (!supplierName) {
      return NextResponse.json({ error: "外发厂家不能为空。" }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "请至少选择一个外发部件。" }, { status: 400 });
    }

    const itemMap = new Map<string, { partId: string; outsourceQuantity: number; remark: string | null }>();
    for (const item of items) {
      const partId = typeof item?.partId === "string" ? item.partId : "";
      const outsourceQuantity = parseQuantity(item?.outsourceQuantity);
      if (!partId) {
        return NextResponse.json({ error: "外发明细缺少部件。" }, { status: 400 });
      }
      if (outsourceQuantity <= 0) {
        return NextResponse.json({ error: "本次外发数量必须大于 0。" }, { status: 400 });
      }

      const existing = itemMap.get(partId);
      if (existing) {
        existing.outsourceQuantity += outsourceQuantity;
        existing.remark = existing.remark ?? normalizeOptional(item?.remark);
      } else {
        itemMap.set(partId, {
          partId,
          outsourceQuantity,
          remark: normalizeOptional(item?.remark)
        });
      }
    }

    const outsourceOrder = await prisma.$transaction(async (tx) => {
      const prefix = `WF${formatOutsourceDate(outsourceDate)}`;
      const latestOrder = await tx.outsourceOrder.findFirst({
        where: { outsourceNo: { startsWith: prefix } },
        orderBy: { outsourceNo: "desc" },
        select: { outsourceNo: true }
      });
      const latestSerial = latestOrder ? Number(latestOrder.outsourceNo.slice(-3)) : 0;
      const outsourceNo = `${prefix}${String(latestSerial + 1).padStart(3, "0")}`;

      const partIds = Array.from(itemMap.keys());
      const parts = await tx.productPart.findMany({
        where: { id: { in: partIds } },
        include: {
          product: { select: { id: true, productName: true, status: true } },
          order: { select: { id: true, orderNo: true, status: true } },
          drawings: {
            orderBy: [{ isMain: "desc" }, { version: "desc" }, { createdAt: "desc" }]
          }
        }
      });

      if (parts.length !== partIds.length) {
        throw new Error("部分外发部件不存在，请刷新后重试。");
      }

      const order = await tx.outsourceOrder.create({
        data: {
          outsourceNo,
          supplierName,
          outsourceType,
          outsourceDate,
          expectedReturnDate,
          handler: normalizeOptional(body.handler),
          status: "OUTSOURCED",
          remark: normalizeOptional(body.remark)
        }
      });

      const productIds = new Set<string>();
      const orderIds = new Set<string>();

      for (const part of parts) {
        const item = itemMap.get(part.id);
        if (!item) continue;

        if (part.status === "ABNORMAL") {
          throw new Error(`部件「${part.partName}」状态为 ABNORMAL，不能继续外发。`);
        }
        if (blockedOutsourceProductStatuses.has(part.product.status)) {
          throw new Error(`产品「${part.product.productName}」状态为 ${part.product.status}，不能继续外发。`);
        }
        if (blockedOutsourceOrderStatuses.has(part.order.status)) {
          throw new Error(`订单「${part.order.orderNo}」状态为 ${part.order.status}，不能继续创建外发单。`);
        }

        const availableQuantity = part.totalQuantity - part.outsourcedQuantity;
        if (availableQuantity <= 0) {
          throw new Error(`部件「${part.partName}」可外发数量不足。`);
        }
        if (item.outsourceQuantity > availableQuantity) {
          throw new Error(`部件「${part.partName}」本次外发数量不能大于可外发数量 ${availableQuantity}。`);
        }

        const drawing = pickOutsourceDrawing(part.drawings);
        await tx.outsourceOrderItem.create({
          data: {
            outsourceOrderId: order.id,
            orderId: part.orderId,
            productId: part.productId,
            partId: part.id,
            drawingId: drawing?.id ?? null,
            partName: part.partName,
            productName: part.product.productName,
            surfaceTreatment: part.surfaceTreatment,
            color: part.color,
            outsourceQuantity: item.outsourceQuantity,
            returnedQuantity: 0,
            missingQuantity: item.outsourceQuantity,
            thumbnailUrl: drawing?.thumbnailUrl ?? drawing?.printThumbnailUrl ?? null,
            originalUrl: drawing?.originalUrl ?? null,
            status: "OUTSOURCED",
            remark: item.remark
          }
        });

        const newOutsourcedQuantity = part.outsourcedQuantity + item.outsourceQuantity;
        const updatedPart = await tx.productPart.updateMany({
          where: {
            id: part.id,
            status: { not: "ABNORMAL" }
          },
          data: {
            outsourcedQuantity: newOutsourcedQuantity,
            missingQuantity: newOutsourcedQuantity - part.returnedQuantity,
            status: "OUTSOURCING"
          }
        });
        if (updatedPart.count !== 1) {
          throw new Error(`部件「${part.partName}」状态已变更，不能继续外发。`);
        }

        productIds.add(part.productId);
        orderIds.add(part.orderId);
      }

      await tx.product.updateMany({
        where: {
          id: { in: Array.from(productIds) },
          status: { notIn: blockedOutsourceProductStatusList }
        },
        data: { status: "OUTSOURCING" }
      });
      await tx.order.updateMany({
        where: {
          id: { in: Array.from(orderIds) },
          status: { notIn: blockedOutsourceOrderStatusList }
        },
        data: { status: "OUTSOURCING" }
      });

      return order;
    });

    return NextResponse.json({ outsourceOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "创建外发单失败。") }, { status: 500 });
  }
}
