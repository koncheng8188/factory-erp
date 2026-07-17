import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAllPermissions } from "@/lib/auth/authorization";
import { DrawingMainError, setMainDrawing } from "@/lib/drawing-main-integrity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "drawing.view",
    "drawing.setMain"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    // setMainDrawing 使用注入客户端的 prisma.$transaction 执行完整事务。
    const drawing = await setMainDrawing({ drawingId: id, client: prisma });
    return NextResponse.json({ drawing });
  } catch (error) {
    console.error("设置主图失败", error);
    if (error instanceof DrawingMainError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "设置主图失败。" }, { status: 500 });
  }
}
