import { NextResponse } from "next/server";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { syncProductStatusFromParts } from "@/lib/product-progress";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AbnormalRequestBody = {
  reason?: unknown;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeReason(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "product.view",
    "part.view",
    "production.view",
    "production.reportAbnormal",
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({} as AbnormalRequestBody));
    const reason = normalizeReason(body.reason);

    if (!reason) {
      return NextResponse.json({ error: "请填写异常原因。" }, { status: 400 });
    }

    if (reason.length > 500) {
      return NextResponse.json({ error: "异常原因不能超过 500 字。" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const part = await tx.productPart.findUnique({
        where: { id },
        select: {
          id: true,
          orderId: true,
          productId: true,
          status: true,
          product: {
            select: {
              status: true
            }
          }
        }
      });

      if (!part) {
        throw new Error("部件不存在。");
      }

      if (part.status === "ABNORMAL") {
        throw new Error("该部件已有未处理异常。");
      }

      if (part.product.status === "PARTIAL_DELIVERED" || part.product.status === "COMPLETED") {
        throw new Error("已送货或已完成产品不允许登记生产异常。");
      }

      const openAbnormal = await tx.productPartAbnormal.findFirst({
        where: {
          productPartId: part.id,
          status: "OPEN"
        },
        select: {
          id: true
        }
      });

      if (openAbnormal) {
        throw new Error("该部件已有未处理异常。");
      }

      const abnormal = await tx.productPartAbnormal.create({
        data: {
          productPartId: part.id,
          productId: part.productId,
          orderId: part.orderId,
          fromStatus: part.status,
          reason,
          status: "OPEN"
        },
        select: {
          id: true,
          status: true,
          createdAt: true
        }
      });

      const updatedPart = await tx.productPart.update({
        where: { id: part.id },
        data: { status: "ABNORMAL" },
        select: {
          id: true,
          status: true
        }
      });

      const product = await syncProductStatusFromParts(tx, part.productId);

      return {
        abnormal,
        part: updatedPart,
        product
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = errorMessage(error, "登记生产异常失败。");
    const status = message === "部件不存在。" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
