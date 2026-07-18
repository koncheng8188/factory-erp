import { NextResponse } from "next/server";
import { requireApiAllPermissions, requireApiPermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { getProductKitting } from "@/lib/kitting";
import {
  ProductionKittingError,
  refreshKittingState
} from "@/lib/production-kitting-integrity";

type RouteContext = {
  params: Promise<{ productId: string }>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireApiPermission("kitting.view");
  if (!authResult.ok) return authResult.response;
  try {
    const { productId } = await context.params;
    const kitting = await getProductKitting(prisma, productId);

    if (!kitting) {
      return NextResponse.json({ error: "产品不存在。" }, { status: 404 });
    }

    return NextResponse.json(kitting);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "查询齐套检查结果失败。") }, { status: 500 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "product.view",
    "part.view",
    "kitting.view",
    "kitting.execute",
  ]);
  if (!authResult.ok) return authResult.response;
  // 事务由完整性服务内部通过 prisma.$transaction 执行。
  try {
    const { productId } = await context.params;
    const kitting = await refreshKittingState({
      client: prisma,
      productId
    });

    const { result } = kitting;
    if (!result.hasParts) {
      return NextResponse.json({
        ...kitting,
        message: "该产品未维护部件，不能齐套。"
      });
    }
    if (result.missingParts.length > 0) {
      return NextResponse.json({
        ...kitting,
        message: result.message,
        missingParts: result.missingParts
      });
    }
    if (result.hasAbnormal) {
      return NextResponse.json({
        ...kitting,
        message: "数量已齐，但存在异常记录，请处理后再送货。"
      });
    }

    return NextResponse.json({
      ...kitting,
      message: "齐套检查完成，产品已进入待送货。"
    });
  } catch (error) {
    if (error instanceof ProductionKittingError) {
      if (error.status >= 500) console.error("执行齐套检查失败。", error.cause ?? error);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("执行齐套检查失败。", error);
    return NextResponse.json({ error: "操作失败，请稍后重试。" }, { status: 500 });
  }
}
