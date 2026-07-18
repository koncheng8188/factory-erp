import type { ProductPartStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { isProductPartStatus } from "@/lib/product-part-status";
import { prisma } from "@/lib/prisma";
import {
  ProductionKittingError,
  resolvePartAbnormal
} from "@/lib/production-kitting-integrity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ResolveRequestBody = {
  status?: unknown;
  restoreStatus?: unknown;
  resolvedRemark?: unknown;
};

function stableErrorResponse(error: unknown) {
  if (error instanceof ProductionKittingError) {
    if (error.status >= 500) console.error("处理生产异常失败。", error.cause ?? error);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("处理生产异常失败。", error);
  return NextResponse.json({ error: "操作失败，请稍后重试。" }, { status: 500 });
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
  // 事务由完整性服务内部通过 prisma.$transaction 执行。
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null) as ResolveRequestBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
    }

    const legacyStatus = body.status ?? body.restoreStatus;
    let requestedStatus: ProductPartStatus | undefined;
    if (legacyStatus !== undefined) {
      const value = typeof legacyStatus === "string" ? legacyStatus.trim() : "";
      if (!isProductPartStatus(value)) {
        return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
      }
      requestedStatus = value as ProductPartStatus;
    }
    const resolvedRemark = typeof body.resolvedRemark === "string" ? body.resolvedRemark.trim() : "";
    if (body.resolvedRemark !== undefined && typeof body.resolvedRemark !== "string") {
      return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
    }
    if (resolvedRemark.length > 500) {
      return NextResponse.json({ error: "处理备注不能超过 500 字。" }, { status: 400 });
    }

    const result = await resolvePartAbnormal({
      client: prisma,
      partId: id,
      requestedStatus,
      resolvedRemark
    });
    return NextResponse.json(result);
  } catch (error) {
    return stableErrorResponse(error);
  }
}
