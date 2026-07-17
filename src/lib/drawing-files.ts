import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

export const productionDrawingStorageRoot = path.join(process.cwd(), "storage", "uploads", "drawings");

export type DrawingStorage = {
  root: string;
  originalsDir: string;
  thumbnailsDir: string;
};

export type PreparedDrawingFile = {
  fileName: string;
  fileType: "jpg" | "png" | "webp" | "pdf";
  buffer: Buffer;
};

export type SavedDrawingFile = {
  fileName: string;
  fileType: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  printThumbnailUrl: string | null;
  uploadStatus: "SUCCESS" | "THUMBNAIL_FAILED";
  errorMessage: string | null;
  createdPaths: string[];
};

export type DrawingFileDependencies = {
  createThumbnail?: (buffer: Buffer, targetPath: string) => Promise<void>;
};

function storageFor(root = productionDrawingStorageRoot): DrawingStorage {
  const resolvedRoot = path.resolve(root);
  return {
    root: resolvedRoot,
    originalsDir: path.join(resolvedRoot, "originals"),
    thumbnailsDir: path.join(resolvedRoot, "thumbnails")
  };
}

function isWithinRoot(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function ensureUploadDirs(storage: DrawingStorage) {
  await Promise.all([
    mkdir(storage.originalsDir, { recursive: true }),
    mkdir(storage.thumbnailsDir, { recursive: true })
  ]);
}

async function createDefaultThumbnail(buffer: Buffer, targetPath: string) {
  await sharp(buffer)
    .rotate()
    .resize({ width: 300, height: 300, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(targetPath);
}

function safePartIdentifier(partId: string) {
  return partId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "part";
}

export async function savePreparedDrawingFile(
  partId: string,
  file: PreparedDrawingFile,
  options: { storageRoot?: string; randomId: () => string; now?: () => number; dependencies?: DrawingFileDependencies } = { randomId: () => crypto.randomUUID() }
): Promise<SavedDrawingFile> {
  const storage = storageFor(options.storageRoot);
  const now = options.now ?? Date.now;
  const randomId = options.randomId();
  const safeName = `${safePartIdentifier(partId)}_${now()}_${randomId}`;
  const originalFileName = `${safeName}.${file.fileType}`;
  const originalPath = path.join(storage.originalsDir, originalFileName);
  const originalUrl = `/uploads/drawings/originals/${originalFileName}`;

  await ensureUploadDirs(storage);
  try {
    await writeFile(originalPath, file.buffer, { flag: "wx" });
  } catch (error) {
    throw error;
  }

  if (file.fileType === "pdf") {
    return {
      fileName: file.fileName,
      fileType: file.fileType,
      originalUrl,
      thumbnailUrl: null,
      printThumbnailUrl: null,
      uploadStatus: "SUCCESS",
      errorMessage: null,
      createdPaths: [originalPath]
    };
  }

  const thumbnailFileName = `${safeName}.webp`;
  const thumbnailPath = path.join(storage.thumbnailsDir, thumbnailFileName);
  const thumbnailUrl = `/uploads/drawings/thumbnails/${thumbnailFileName}`;
  try {
    await (options.dependencies?.createThumbnail ?? createDefaultThumbnail)(file.buffer, thumbnailPath);
    return {
      fileName: file.fileName,
      fileType: file.fileType,
      originalUrl,
      thumbnailUrl,
      printThumbnailUrl: thumbnailUrl,
      uploadStatus: "SUCCESS",
      errorMessage: null,
      createdPaths: [originalPath, thumbnailPath]
    };
  } catch (error) {
    await rm(thumbnailPath, { force: true }).catch((cleanupError) => console.error("清理失败缩略图失败", cleanupError));
    return {
      fileName: file.fileName,
      fileType: file.fileType,
      originalUrl,
      thumbnailUrl: null,
      printThumbnailUrl: null,
      uploadStatus: "THUMBNAIL_FAILED",
      errorMessage: "缩略图生成失败。",
      createdPaths: [originalPath]
    };
  }
}

export async function deleteSavedDrawingFiles(files: readonly SavedDrawingFile[], storageRoot = productionDrawingStorageRoot) {
  const storage = storageFor(storageRoot);
  const paths = files.flatMap((file) => file.createdPaths).filter((filePath) => isWithinRoot(storage.root, filePath));
  await Promise.all(paths.map(async (filePath) => {
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      console.error("清理上传图纸文件失败", error);
    }
  }));
}

export function drawingStoragePaths(storageRoot = productionDrawingStorageRoot) {
  return storageFor(storageRoot);
}
