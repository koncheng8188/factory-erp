import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { allowedDrawingFileMessage, isAllowedDrawingFile, saveDrawingFile } from "@/lib/drawing-files";
import { requireApiUser } from "@/lib/auth/api-user";

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
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const drawings = await prisma.partDrawing.findMany({
      where: { partId: id },
      orderBy: [{ isMain: "desc" }, { version: "desc" }, { createdAt: "desc" }]
    });

    return NextResponse.json({ drawings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "查询图纸失败。") }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await requireApiUser();
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

    const formData = await request.formData();
    const entries = formData.getAll("files");
    const files = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (files.length === 0) {
      const singleFile = formData.get("file");
      if (singleFile instanceof File && singleFile.size > 0) {
        files.push(singleFile);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "请先选择要上传的图纸文件。" }, { status: 400 });
    }

    const invalidFile = files.find((file) => !isAllowedDrawingFile(file));
    if (invalidFile) {
      return NextResponse.json({ error: allowedDrawingFileMessage() }, { status: 400 });
    }

    const existingCount = await prisma.partDrawing.count({ where: { partId: part.id } });
    const latestDrawing = await prisma.partDrawing.findFirst({
      where: { partId: part.id },
      orderBy: { version: "desc" },
      select: { version: true }
    });
    const startVersion = latestDrawing ? latestDrawing.version + 1 : 1;
    const remark = normalizeOptional(formData.get("remark"));

    const savedFiles = await Promise.all(files.map((file) => saveDrawingFile(part.id, file)));
    const drawings = await prisma.$transaction(
      savedFiles.map((savedFile, index) =>
        prisma.partDrawing.create({
          data: {
            orderId: part.orderId,
            productId: part.productId,
            partId: part.id,
            fileName: savedFile.fileName,
            fileType: savedFile.fileType,
            originalUrl: savedFile.originalUrl,
            thumbnailUrl: savedFile.thumbnailUrl,
            printThumbnailUrl: savedFile.printThumbnailUrl,
            version: startVersion + index,
            isMain: existingCount === 0 && index === 0,
            status: "PENDING",
            uploadStatus: savedFile.uploadStatus,
            errorMessage: savedFile.errorMessage,
            remark
          }
        })
      )
    );

    return NextResponse.json({ drawings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "上传图纸失败。") }, { status: 500 });
  }
}
