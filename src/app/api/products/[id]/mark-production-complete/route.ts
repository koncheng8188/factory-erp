import { NextResponse } from "next/server";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  markProductProductionComplete,
  ProductionKittingError
} from "@/lib/production-kitting-integrity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function stableErrorResponse(error: unknown) {
  if (error instanceof ProductionKittingError) {
    if (error.status >= 500) console.error("标记生产完成失败。", error.cause ?? error);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("标记生产完成失败。", error);
  return NextResponse.json({ error: "操作失败，请稍后重试。" }, { status: 500 });
}

export async function POST(_request: Request, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "product.view",
    "part.view",
    "production.view",
    "production.completeProduct",
  ]);
  if (!authResult.ok) return authResult.response;
  // 事务由完整性服务内部通过 prisma.$transaction 执行。
  try {
    const { id } = await context.params;
    const result = await markProductProductionComplete({
      client: prisma,
      productId: id
    });
    return NextResponse.json(result);
  } catch (error) {
    return stableErrorResponse(error);
  }
}
