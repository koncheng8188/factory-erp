import "server-only";

import { readFile, stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

type DrawingFileVariant = "file" | "thumbnail" | "print-thumbnail";

const directories = {
  privateOriginals: path.join(process.cwd(), "storage", "uploads", "drawings", "originals"),
  privateThumbnails: path.join(process.cwd(), "storage", "uploads", "drawings", "thumbnails"),
  legacyOriginals: path.join(process.cwd(), "public", "uploads", "drawings", "originals"),
  legacyThumbnails: path.join(process.cwd(), "public", "uploads", "drawings", "thumbnails")
};

const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf"
};

function legacyFileName(value: string, prefix: string) {
  if (!value.startsWith(prefix)) return null;
  let fileName: string;
  try {
    fileName = decodeURIComponent(value.slice(prefix.length));
  } catch {
    return null;
  }
  if (!fileName || fileName === "." || fileName === ".." || !/^[A-Za-z0-9._-]+$/.test(fileName)) return null;
  return fileName;
}

function safePath(directory: string, fileName: string) {
  const resolvedDirectory = path.resolve(directory);
  const resolvedFile = path.resolve(resolvedDirectory, fileName);
  const relative = path.relative(resolvedDirectory, resolvedFile);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? resolvedFile : null;
}

export async function getDrawingFile(drawingId: string, variant: DrawingFileVariant) {
  const drawing = await prisma.partDrawing.findUnique({
    where: { id: drawingId },
    select: { fileName: true, originalUrl: true, thumbnailUrl: true, printThumbnailUrl: true }
  });
  if (!drawing) return null;

  const isOriginal = variant === "file";
  const value = isOriginal ? drawing.originalUrl : variant === "thumbnail" ? drawing.thumbnailUrl : drawing.printThumbnailUrl ?? drawing.thumbnailUrl;
  if (!value) return null;
  const directoriesToTry = isOriginal ? [directories.privateOriginals, directories.legacyOriginals] : [directories.privateThumbnails, directories.legacyThumbnails];
  const prefix = isOriginal ? "/uploads/drawings/originals/" : "/uploads/drawings/thumbnails/";
  const fileName = legacyFileName(value, prefix);
  if (!fileName) return null;
  const extension = path.extname(fileName).toLowerCase();
  const contentType = mimeTypes[extension];
  if (!contentType) return null;

  for (const directory of directoriesToTry) {
    const filePath = safePath(directory, fileName);
    if (!filePath) continue;
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;
      return { buffer: await readFile(filePath), contentType, contentLength: fileStat.size, fileName: drawing.fileName, extension };
    } catch {
      continue;
    }
  }
  return null;
}

export function contentDisposition(fileName: string, extension: string) {
  const cleaned = fileName.replace(/[\r\n"]/g, "").trim() || `drawing${extension}`;
  const fallback = cleaned.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-") || `drawing${extension}`;
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
}
