import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAllPermissions } from "@/lib/auth/authorization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const allowedStatuses = new Set(["PENDING", "CONFIRMED", "OBSOLETE"]);

function normalizeOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "drawing.view",
    "drawing.update"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const body = await request.json();
    const data: { status?: "PENDING" | "CONFIRMED" | "OBSOLETE"; remark?: string | null; isMain?: boolean } = {};

    if (body.status !== undefined) {
      if (body.status === "OBSOLETE") {
        return NextResponse.json({ error: "图纸作废请使用作废操作。" }, { status: 400 });
      }
      if (typeof body.status !== "string" || !allowedStatuses.has(body.status)) {
        return NextResponse.json({ error: "图纸状态不正确。" }, { status: 400 });
      }
      data.status = body.status;
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
    return NextResponse.json({ error: errorMessage(error, "更新图纸失败。") }, { status: 500 });
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
    return NextResponse.json({ error: errorMessage(error, "作废图纸失败。") }, { status: 500 });
  }
}
