import type { ProductPartStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { isProductPartStatus } from "@/lib/product-part-status";
import { syncProductStatusFromParts } from "@/lib/product-progress";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ResolveRequestBody = {
  restoreStatus?: unknown;
  resolvedRemark?: unknown;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "product.view",
    "part.view",
    "production.abnormal.view",
    "production.resolveAbnormal",
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({} as ResolveRequestBody));
    const restoreStatusValue = typeof body.restoreStatus === "string" ? body.restoreStatus.trim() : "";
    const resolvedRemark = normalizeOptionalText(body.resolvedRemark);

    if (!isProductPartStatus(restoreStatusValue) || restoreStatusValue === "ABNORMAL") {
      return NextResponse.json({ error: "请选择合法的恢复阶段。" }, { status: 400 });
    }

    if (resolvedRemark.length > 500) {
      return NextResponse.json({ error: "处理备注不能超过 500 字。" }, { status: 400 });
    }

    const restoreStatus = restoreStatusValue as ProductPartStatus;

    const result = await prisma.$transaction(async (tx) => {
      const abnormal = await tx.productPartAbnormal.findFirst({
        where: {
          productPartId: id,
          status: "OPEN"
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          productId: true,
          productPartId: true
        }
      });

      if (!abnormal) {
        throw new Error("未找到未处理的生产异常。");
      }

      const resolvedAbnormal = await tx.productPartAbnormal.update({
        where: { id: abnormal.id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolvedRemark: resolvedRemark || null
        },
        select: {
          id: true,
          status: true,
          resolvedAt: true
        }
      });

      const updatedPart = await tx.productPart.update({
        where: { id: abnormal.productPartId },
        data: { status: restoreStatus },
        select: {
          id: true,
          status: true
        }
      });

      const product = await syncProductStatusFromParts(tx, abnormal.productId);

      return {
        abnormal: resolvedAbnormal,
        part: updatedPart,
        product
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = errorMessage(error, "处理生产异常失败。");
    const status = message === "未找到未处理的生产异常。" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
