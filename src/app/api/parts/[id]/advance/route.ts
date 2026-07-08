import { NextResponse } from "next/server";
import { getNextPartStatus, syncProductStatusFromParts } from "@/lib/product-progress";
import { prisma } from "@/lib/prisma";
import type { ProductPartStatus } from "@prisma/client";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getAdvanceActionName(fromStatus: ProductPartStatus, toStatus: ProductPartStatus) {
  if ((fromStatus === "PENDING" || fromStatus === "CUTTING") && toStatus === "WELDING") {
    return "完成下料，进入焊接";
  }
  if (fromStatus === "WELDING" && toStatus === "POLISHING") {
    return "完成焊接，进入抛光";
  }
  if (fromStatus === "POLISHING" && toStatus === "WAIT_OUTSOURCE") {
    return "完成抛光，进入待外发";
  }
  return null;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const result = await prisma.$transaction(async (tx) => {
      const part = await tx.productPart.findUnique({
        where: { id },
        select: {
          id: true,
          orderId: true,
          productId: true,
          status: true
        }
      });

      if (!part) {
        throw new Error("部件不存在。");
      }

      const nextStatus = getNextPartStatus(part.status);
      if (!nextStatus) {
        throw new Error("当前部件状态不允许在生产进度页继续推进。");
      }

      const actionName = getAdvanceActionName(part.status, nextStatus);
      if (!actionName) {
        throw new Error("当前部件状态推进不支持记录生产日报。");
      }

      const updatedPart = await tx.productPart.update({
        where: { id: part.id },
        data: { status: nextStatus },
        select: {
          id: true,
          productId: true,
          status: true
        }
      });
      const progressLog = await tx.productPartProgressLog.create({
        data: {
          productPartId: part.id,
          productId: part.productId,
          orderId: part.orderId,
          fromStatus: part.status,
          toStatus: nextStatus,
          actionName
        },
        select: {
          id: true,
          occurredAt: true,
          actionName: true
        }
      });
      const product = await syncProductStatusFromParts(tx, part.productId);

      return {
        part: updatedPart,
        progressLog,
        product
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "推进部件状态失败。") }, { status: 400 });
  }
}
