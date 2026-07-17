import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAllPermissions, requireApiPermission } from "@/lib/auth/authorization";
import { withProtectedDrawingUrls } from "@/lib/drawing-file-url";
import { DrawingUploadError, uploadDrawingBatch } from "@/lib/drawing-upload-integrity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeOptional(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const authResult = await requireApiPermission("drawing.view");
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const drawings = await prisma.partDrawing.findMany({
      where: { partId: id },
      orderBy: [{ isMain: "desc" }, { version: "desc" }, { createdAt: "desc" }]
    });

    return NextResponse.json({ drawings: drawings.map(withProtectedDrawingUrls) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "查询图纸失败。") }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "part.view",
    "drawing.view",
    "drawing.upload"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const part = await prisma.productPart.findUnique({
      where: { id },
      select: { id: true, orderId: true, productId: true }
    });

    if (!part) {
      return NextResponse.json({ error: "部件不存在。" }, { status: 404 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error("解析图纸上传请求失败", error);
      return NextResponse.json({ error: "上传请求格式无效。" }, { status: 400 });
    }
    const entries = formData.getAll("files");
    const files = entries.filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      const singleFile = formData.get("file");
      if (singleFile instanceof File) {
        files.push(singleFile);
      }
    }
    const remark = normalizeOptional(formData.get("remark"));

    // saveDrawingFile 的单文件职责已由整批预验证后的 uploadDrawingBatch 取代。
    const { drawings } = await uploadDrawingBatch({ files, part, client: prisma, remark });

    return NextResponse.json({ drawings: drawings.map(withProtectedDrawingUrls) });
  } catch (error) {
    if (error instanceof DrawingUploadError) {
      console.error("图纸上传失败", error.cause ?? error);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("图纸上传未知错误", error);
    return NextResponse.json({ error: "上传图纸失败。" }, { status: 500 });
  }
}
