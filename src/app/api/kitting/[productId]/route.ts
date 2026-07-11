import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProductKitting, refreshProductKittingStatus } from "@/lib/kitting";
import { requireApiUser } from "@/lib/auth/api-user";

type RouteContext = {
  params: Promise<{ productId: string }>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireApiUser();
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
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  try {
    const { productId } = await context.params;
    const kitting = await prisma.$transaction((tx) => refreshProductKittingStatus(tx, productId));

    if (!kitting) {
      return NextResponse.json({ error: "产品不存在。" }, { status: 404 });
    }

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
    return NextResponse.json({ error: errorMessage(error, "执行齐套检查失败。") }, { status: 500 });
  }
}
