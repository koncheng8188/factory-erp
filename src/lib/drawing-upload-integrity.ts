import { randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import sharp from "sharp";

type DrawingFileDependencies = {
  createThumbnail?: (buffer: Buffer, targetPath: string) => Promise<void>;
  writeOriginal?: (targetPath: string, buffer: Buffer) => Promise<void>;
  randomId?: () => string;
  now?: () => number;
  onImageMetadataValidated?: () => void;
  beforeVersionCreateAttempt?: (context: { attempt: number; versions: readonly number[] }) => Promise<void>;
};

type PreparedDrawingFile = {
  fileName: string;
  fileType: "jpg" | "png" | "webp" | "pdf";
  buffer: Buffer;
};

type SavedDrawingFile = {
  fileName: string;
  fileType: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  printThumbnailUrl: string | null;
  uploadStatus: "SUCCESS" | "THUMBNAIL_FAILED";
  errorMessage: string | null;
  createdPaths: string[];
};

export const MAX_DRAWING_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_DRAWING_FILE_COUNT = 20;
export const MAX_DRAWING_REQUEST_SIZE = 200 * 1024 * 1024;
export const MAX_VERSION_CREATE_ATTEMPTS = 3;

export class DrawingUploadError extends Error {
  readonly status: number;
  readonly cause?: unknown;

  constructor(status: number, message: string, cause?: unknown) {
    super(message);
    this.name = "DrawingUploadError";
    this.status = status;
    this.cause = cause;
  }
}

type UploadFile = Pick<File, "name" | "type" | "size" | "arrayBuffer">;
type DrawingPart = { id: string; orderId: string; productId: string };
type DrawingClient = {
  partDrawing: {
    count(args: unknown): Promise<number>;
    findFirst(args: unknown): Promise<{ id?: string; version?: number } | null>;
    create(args: unknown): unknown;
  };
  $transaction(args: readonly unknown[]): Promise<any[]>;
};

const allowed = new Map([
  [".jpg", { mime: "image/jpeg", type: "jpg" as const }],
  [".jpeg", { mime: "image/jpeg", type: "jpg" as const }],
  [".png", { mime: "image/png", type: "png" as const }],
  [".webp", { mime: "image/webp", type: "webp" as const }],
  [".pdf", { mime: "application/pdf", type: "pdf" as const }]
]);

function storagePaths(root = path.join(process.cwd(), "storage", "uploads", "drawings")) {
  const resolvedRoot = path.resolve(root);
  return {
    root: resolvedRoot,
    originals: path.join(resolvedRoot, "originals"),
    thumbnails: path.join(resolvedRoot, "thumbnails")
  };
}

function isWithinStorageRoot(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safePartIdentifier(partId: string) {
  return partId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "part";
}

async function createThumbnail(buffer: Buffer, targetPath: string) {
  await sharp(buffer)
    .rotate()
    .resize({ width: 300, height: 300, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(targetPath);
}

async function savePreparedDrawingFile(partId: string, file: PreparedDrawingFile, storageRoot: string | undefined, dependencies: DrawingFileDependencies | undefined): Promise<SavedDrawingFile> {
  const storage = storagePaths(storageRoot);
  await Promise.all([mkdir(storage.originals, { recursive: true }), mkdir(storage.thumbnails, { recursive: true })]);
  const baseName = `${safePartIdentifier(partId)}_${dependencies?.now?.() ?? Date.now()}_${dependencies?.randomId?.() ?? randomUUID()}`;
  const originalFileName = `${baseName}.${file.fileType}`;
  const originalPath = path.join(storage.originals, originalFileName);
  await (dependencies?.writeOriginal ?? ((targetPath, buffer) => writeFile(targetPath, buffer, { flag: "wx" })))(originalPath, file.buffer);
  const originalUrl = `/uploads/drawings/originals/${originalFileName}`;

  if (file.fileType === "pdf") {
    return { fileName: file.fileName, fileType: file.fileType, originalUrl, thumbnailUrl: null, printThumbnailUrl: null, uploadStatus: "SUCCESS", errorMessage: null, createdPaths: [originalPath] };
  }

  const thumbnailFileName = `${baseName}.webp`;
  const thumbnailPath = path.join(storage.thumbnails, thumbnailFileName);
  const thumbnailUrl = `/uploads/drawings/thumbnails/${thumbnailFileName}`;
  try {
    await (dependencies?.createThumbnail ?? createThumbnail)(file.buffer, thumbnailPath);
    return { fileName: file.fileName, fileType: file.fileType, originalUrl, thumbnailUrl, printThumbnailUrl: thumbnailUrl, uploadStatus: "SUCCESS", errorMessage: null, createdPaths: [originalPath, thumbnailPath] };
  } catch {
    await rm(thumbnailPath, { force: true });
    return { fileName: file.fileName, fileType: file.fileType, originalUrl, thumbnailUrl: null, printThumbnailUrl: null, uploadStatus: "THUMBNAIL_FAILED", errorMessage: "缩略图生成失败。", createdPaths: [originalPath] };
  }
}

export async function deleteSavedDrawingFiles(files: readonly SavedDrawingFile[], storageRoot?: string) {
  const storage = storagePaths(storageRoot);
  const paths = files.flatMap((file) => file.createdPaths).filter((filePath) => isWithinStorageRoot(storage.root, filePath));
  await Promise.all(paths.map(async (filePath) => {
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      console.error("清理上传图纸文件失败", error);
    }
  }));
}

function extension(name: string) {
  return path.extname(name).toLowerCase();
}

function hasPrefix(buffer: Buffer, values: number[]) {
  return values.every((value, index) => buffer[index] === value);
}

function validSignature(type: PreparedDrawingFile["fileType"], buffer: Buffer) {
  if (type === "jpg") return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
  if (type === "png") return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === "webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function validateImage(buffer: Buffer, dependencies?: DrawingFileDependencies) {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || metadata.width <= 0 || metadata.height <= 0) throw new Error("invalid dimensions");
  } catch (error) {
    throw new DrawingUploadError(400, "图片文件损坏或格式不受支持。", error);
  }
  dependencies?.onImageMetadataValidated?.();
}

export async function prevalidateDrawingFiles(files: readonly UploadFile[], dependencies?: DrawingFileDependencies): Promise<PreparedDrawingFile[]> {
  if (files.length === 0) throw new DrawingUploadError(400, "请选择要上传的图纸文件。");
  if (files.length > MAX_DRAWING_FILE_COUNT) throw new DrawingUploadError(400, "单次最多上传 20 个图纸文件。");
  let totalSize = 0;
  for (const file of files) {
    if (file.size === 0) throw new DrawingUploadError(400, "图纸文件不能为空。");
    if (file.size > MAX_DRAWING_FILE_SIZE) throw new DrawingUploadError(413, "单个图纸文件不能超过 50 MB。");
    totalSize += file.size;
  }
  if (totalSize > MAX_DRAWING_REQUEST_SIZE) throw new DrawingUploadError(413, "单次上传文件总大小不能超过 200 MB。");

  const prepared: PreparedDrawingFile[] = [];
  for (const file of files) {
    const rule = allowed.get(extension(file.name));
    if (!rule || file.type !== rule.mime) throw new DrawingUploadError(400, "仅支持 JPG、JPEG、PNG、WEBP 和 PDF 文件。");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validSignature(rule.type, buffer)) {
      throw new DrawingUploadError(400, rule.type === "pdf" ? "PDF文件格式无效。" : "仅支持 JPG、JPEG、PNG、WEBP 和 PDF 文件。");
    }
    if (rule.type !== "pdf") await validateImage(buffer, dependencies);
    prepared.push({ fileName: file.name, fileType: rule.type, buffer });
  }
  return prepared;
}

export function isPrismaForeignKeyError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

function isPrismaUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function uploadDrawingBatch({
  files,
  part,
  client,
  remark,
  storageRoot,
  dependencies
}: {
  files: readonly UploadFile[];
  part: DrawingPart;
  client: DrawingClient;
  remark: string | null;
  storageRoot?: string;
  dependencies?: DrawingFileDependencies;
}) {
  const prepared = await prevalidateDrawingFiles(files, dependencies);
  const existingCount = await client.partDrawing.count({ where: { partId: part.id } });
  const savedFiles: SavedDrawingFile[] = [];
  try {
    for (const file of prepared) {
      try {
        savedFiles.push(await savePreparedDrawingFile(part.id, file, storageRoot, dependencies));
      } catch (error) {
        throw new DrawingUploadError(500, "保存图纸文件失败。", error);
      }
    }
    let versionConflictAttempts = 0;
    let databaseAttempt = 0;
    let plansMainDrawing = existingCount === 0;
    let mainDrawingDowngraded = false;
    while (versionConflictAttempts < MAX_VERSION_CREATE_ATTEMPTS) {
      databaseAttempt += 1;
      const latestDrawing = await client.partDrawing.findFirst({
        where: { partId: part.id },
        orderBy: { version: "desc" },
        select: { version: true }
      });
      const startVersion = (latestDrawing?.version ?? 0) + 1;
      const versions = savedFiles.map((_savedFile, index) => startVersion + index);
      await dependencies?.beforeVersionCreateAttempt?.({ attempt: databaseAttempt, versions });
      try {
        const drawings = await client.$transaction(savedFiles.map((savedFile, index) =>
          client.partDrawing.create({ data: {
            orderId: part.orderId, productId: part.productId, partId: part.id,
            fileName: savedFile.fileName, fileType: savedFile.fileType,
            originalUrl: savedFile.originalUrl, thumbnailUrl: savedFile.thumbnailUrl,
            printThumbnailUrl: savedFile.printThumbnailUrl, version: versions[index],
            isMain: plansMainDrawing && index === 0, status: "PENDING",
            uploadStatus: savedFile.uploadStatus, errorMessage: savedFile.errorMessage, remark
          } })
        ));
        return { drawings, savedFiles };
      } catch (error) {
        if (isPrismaUniqueConstraintError(error)) {
          if (plansMainDrawing && !mainDrawingDowngraded) {
            const existingMainDrawing = await client.partDrawing.findFirst({
              where: { partId: part.id, isMain: true },
              select: { id: true }
            });
            if (existingMainDrawing) {
              plansMainDrawing = false;
              mainDrawingDowngraded = true;
              continue;
            }
          }
          versionConflictAttempts += 1;
          if (versionConflictAttempts < MAX_VERSION_CREATE_ATTEMPTS) continue;
          throw new DrawingUploadError(409, "图纸版本冲突，请重新上传。", error);
        }
        if (isPrismaForeignKeyError(error)) throw new DrawingUploadError(404, "部件不存在。", error);
        throw new DrawingUploadError(500, "保存图纸记录失败。", error);
      }
    }
    throw new DrawingUploadError(500, "保存图纸记录失败。");
  } catch (error) {
    await deleteSavedDrawingFiles(savedFiles, storageRoot);
    throw error;
  }
}
