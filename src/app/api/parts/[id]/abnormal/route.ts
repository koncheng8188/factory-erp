import { NextResponse } from "next/server";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  ProductionKittingError,
  reportPartAbnormal
} from "@/lib/production-kitting-integrity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AbnormalRequestBody = {
  reason?: unknown;
};

function stableErrorResponse(error: unknown) {
  if (error instanceof ProductionKittingError) {
    if (error.status >= 500) console.error("登记生产异常失败。", error.cause ?? error);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("登记生产异常失败。", error);
  return NextResponse.json({ error: "操作失败，请稍后重试。" }, { status: 500 });
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
  // 事务由完整性服务内部通过 prisma.$transaction 执行。
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null) as AbnormalRequestBody | null;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
    }
    if (reason.length > 500) {
      return NextResponse.json({ error: "异常原因不能超过 500 字。" }, { status: 400 });
    }

    const result = await reportPartAbnormal({
      client: prisma,
      partId: id,
      reason
    });
    return NextResponse.json(result);
  } catch (error) {
    return stableErrorResponse(error);
  }
}
