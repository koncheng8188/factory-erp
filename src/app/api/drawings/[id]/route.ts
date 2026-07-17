import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiAllPermissions } from "@/lib/auth/authorization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const allowedStatuses = new Set(["PENDING", "CONFIRMED", "OBSOLETE"]);

function normalizeOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPrismaNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "drawing.view",
    "drawing.update"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch (error) {
      console.error("解析图纸更新请求失败", error);
      return NextResponse.json({ error: "图纸更新请求格式无效。" }, { status: 400 });
    }
    const data: { status?: "PENDING" | "CONFIRMED" | "OBSOLETE"; remark?: string | null; isMain?: boolean } = {};

    if (body.status !== undefined) {
      if (body.status === "OBSOLETE") {
        return NextResponse.json({ error: "图纸作废请使用作废操作。" }, { status: 400 });
      }
      if (typeof body.status !== "string" || !allowedStatuses.has(body.status)) {
        return NextResponse.json({ error: "图纸状态不正确。" }, { status: 400 });
      }
      data.status = body.status as "PENDING" | "CONFIRMED" | "OBSOLETE";
    }

    if (body.remark !== undefined) {
      data.remark = normalizeOptional(body.remark);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "没有需要更新的图纸字段。" }, { status: 400 });
    }

    const drawing = await prisma.partDrawing.update({
      where: { id },
      data
    });

    return NextResponse.json({ drawing });
  } catch (error) {
    console.error("更新图纸失败", error);
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: "图纸不存在。" }, { status: 404 });
    }
    return NextResponse.json({ error: "保存图纸失败。" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "drawing.view",
    "drawing.obsolete"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const drawing = await prisma.partDrawing.update({
      where: { id },
      data: { status: "OBSOLETE", isMain: false }
    });

    return NextResponse.json({ drawing });
  } catch (error) {
    console.error("作废图纸失败", error);
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: "图纸不存在。" }, { status: 404 });
    }
    return NextResponse.json({ error: "作废图纸失败。" }, { status: 500 });
  }
}
