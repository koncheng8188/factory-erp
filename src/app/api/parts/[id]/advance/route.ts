import { NextResponse } from "next/server";
import { getNextPartStatus, syncProductStatusFromParts } from "@/lib/product-progress";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const result = await prisma.$transaction(async (tx) => {
      const part = await tx.productPart.findUnique({
        where: { id },
        select: {
          id: true,
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

      const updatedPart = await tx.productPart.update({
        where: { id: part.id },
        data: { status: nextStatus },
        select: {
          id: true,
          productId: true,
          status: true
        }
      });
      const product = await syncProductStatusFromParts(tx, part.productId);

      return {
        part: updatedPart,
        product
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "推进部件状态失败。") }, { status: 400 });
  }
}
