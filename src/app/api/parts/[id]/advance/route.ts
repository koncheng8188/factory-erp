import type { ProductPartStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { isProductPartStatus } from "@/lib/product-part-status";
import { prisma } from "@/lib/prisma";
import {
  advancePartProduction,
  ProductionKittingError
} from "@/lib/production-kitting-integrity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AdvanceRequestBody = {
  expectedStatus?: unknown;
};

function stableErrorResponse(error: unknown) {
  if (error instanceof ProductionKittingError) {
    if (error.status >= 500) console.error("推进部件状态失败。", error.cause ?? error);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("推进部件状态失败。", error);
  return NextResponse.json({ error: "操作失败，请稍后重试。" }, { status: 500 });
}

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "product.view",
    "part.view",
    "production.view",
    "production.updateProgress",
  ]);
  if (!authResult.ok) return authResult.response;
  // 事务由完整性服务内部通过 prisma.$transaction 执行。
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null) as AdvanceRequestBody | null;
    const expectedStatusValue = typeof body?.expectedStatus === "string" ? body.expectedStatus.trim() : "";
    if (!isProductPartStatus(expectedStatusValue)) {
      return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
    }

    const result = await advancePartProduction({
      client: prisma,
      partId: id,
      expectedStatus: expectedStatusValue as ProductPartStatus
    });
    return NextResponse.json(result);
  } catch (error) {
    return stableErrorResponse(error);
  }
}
