import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["application/pdf", "pdf"]
]);

const originalsDir = path.join(process.cwd(), "public", "uploads", "drawings", "originals");
const thumbnailsDir = path.join(process.cwd(), "public", "uploads", "drawings", "thumbnails");

export type SavedDrawingFile = {
  fileName: string;
  fileType: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  printThumbnailUrl: string | null;
  uploadStatus: "SUCCESS" | "THUMBNAIL_FAILED";
  errorMessage: string | null;
};

export function isAllowedDrawingFile(file: File) {
  return allowedTypes.has(file.type);
}

export function allowedDrawingFileMessage() {
  return "仅支持 JPG、JPEG、PNG、WEBP、PDF 图纸文件。DWG/DXF 请先导出为 PDF 或图片后上传。";
}

function safeBaseName(fileName: string) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const normalized = baseName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();

  return normalized || "drawing";
}

function extensionFor(file: File) {
  return allowedTypes.get(file.type) ?? "bin";
}

async function ensureUploadDirs() {
  await Promise.all([
    mkdir(originalsDir, { recursive: true }),
    mkdir(thumbnailsDir, { recursive: true })
  ]);
}

export async function saveDrawingFile(partId: string, file: File): Promise<SavedDrawingFile> {
  if (!isAllowedDrawingFile(file)) {
    throw new Error(allowedDrawingFileMessage());
  }

  await ensureUploadDirs();

  const extension = extensionFor(file);
  const timestamp = Date.now();
  const safeName = `${partId}_${timestamp}_${safeBaseName(file.name)}`;
  const originalFileName = `${safeName}.${extension}`;
  const originalPath = path.join(originalsDir, originalFileName);
  const originalUrl = `/uploads/drawings/originals/${originalFileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(originalPath, buffer);

  if (file.type === "application/pdf") {
    return {
      fileName: file.name,
      fileType: extension,
      originalUrl,
      thumbnailUrl: null,
      printThumbnailUrl: null,
      uploadStatus: "SUCCESS",
      errorMessage: null
    };
  }

  const thumbnailFileName = `${safeName}.webp`;
  const thumbnailPath = path.join(thumbnailsDir, thumbnailFileName);
  const thumbnailUrl = `/uploads/drawings/thumbnails/${thumbnailFileName}`;

  try {
    await sharp(buffer)
      .rotate()
      .resize({ width: 300, height: 300, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(thumbnailPath);

    return {
      fileName: file.name,
      fileType: extension,
      originalUrl,
      thumbnailUrl,
      printThumbnailUrl: thumbnailUrl,
      uploadStatus: "SUCCESS",
      errorMessage: null
    };
  } catch (error) {
    return {
      fileName: file.name,
      fileType: extension,
      originalUrl,
      thumbnailUrl: null,
      printThumbnailUrl: null,
      uploadStatus: "THUMBNAIL_FAILED",
      errorMessage: error instanceof Error ? error.message : "缩略图生成失败。"
    };
  }
}
