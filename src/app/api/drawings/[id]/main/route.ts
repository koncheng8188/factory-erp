import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const drawing = await prisma.partDrawing.findUnique({
      where: { id },
      select: { id: true, partId: true, status: true }
    });

    if (!drawing) {
      return NextResponse.json({ error: "图纸不存在。" }, { status: 404 });
    }

    if (drawing.status === "OBSOLETE") {
      return NextResponse.json({ error: "已作废图纸不能设为主图。" }, { status: 400 });
    }

    const [, mainDrawing] = await prisma.$transaction([
      prisma.partDrawing.updateMany({
        where: { partId: drawing.partId },
        data: { isMain: false }
      }),
      prisma.partDrawing.update({
        where: { id: drawing.id },
        data: { isMain: true }
      })
    ]);

    return NextResponse.json({ drawing: mainDrawing });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "设置主图失败。") }, { status: 500 });
  }
}
