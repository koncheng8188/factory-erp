import { Prisma } from "@prisma/client";

export const MAX_MAIN_SWITCH_ATTEMPTS = 3;

export class DrawingMainError extends Error {
  readonly status: number;
  readonly cause?: unknown;

  constructor(status: number, message: string, cause?: unknown) {
    super(message);
    this.name = "DrawingMainError";
    this.status = status;
    this.cause = cause;
  }
}

type MainDrawingRecord = {
  id: string;
  partId: string;
  status: string;
};

type DrawingMainTransaction = {
  partDrawing: {
    findUnique(args: unknown): Promise<MainDrawingRecord | null>;
    updateMany(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
};

type DrawingMainClient = {
  $transaction<T>(callback: (transaction: DrawingMainTransaction) => Promise<T>): Promise<T>;
};

type DrawingMainDependencies = {
  sleep?: (milliseconds: number) => Promise<void>;
  beforeAttempt?: (attempt: number) => Promise<void>;
};

function isKnownPrismaError(
  error: unknown,
  code: string
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isTransientSqliteLock(error: unknown) {
  if (isKnownPrismaError(error, "P2034")) return true;
  if (
    isKnownPrismaError(error, "P1008")
    && /Socket timeout \(the database failed to respond to a query within the configured timeout/i.test(error.message)
  ) {
    return true;
  }
  if (!(error instanceof Prisma.PrismaClientUnknownRequestError)) return false;
  return /\bSQLITE_BUSY\b|database is locked/i.test(error.message);
}

async function defaultSleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function setMainDrawing({
  drawingId,
  client,
  dependencies
}: {
  drawingId: string;
  client: DrawingMainClient;
  dependencies?: DrawingMainDependencies;
}) {
  for (let attempt = 1; attempt <= MAX_MAIN_SWITCH_ATTEMPTS; attempt += 1) {
    await dependencies?.beforeAttempt?.(attempt);
    try {
      return await client.$transaction(async (transaction) => {
        const drawing = await transaction.partDrawing.findUnique({
          where: { id: drawingId },
          select: { id: true, partId: true, status: true }
        });
        if (!drawing) {
          throw new DrawingMainError(404, "图纸不存在。");
        }
        if (drawing.status === "OBSOLETE") {
          throw new DrawingMainError(400, "已作废图纸不能设为主图。");
        }
        await transaction.partDrawing.updateMany({
          where: { partId: drawing.partId },
          data: { isMain: false }
        });
        return transaction.partDrawing.update({
          where: { id: drawing.id },
          data: { isMain: true }
        });
      });
    } catch (error) {
      if (error instanceof DrawingMainError) throw error;
      if (isKnownPrismaError(error, "P2025")) {
        throw new DrawingMainError(404, "图纸不存在。", error);
      }
      if (isKnownPrismaError(error, "P2002")) {
        throw new DrawingMainError(409, "主图切换冲突，请重试。", error);
      }
      if (!isTransientSqliteLock(error)) throw error;
      if (attempt === MAX_MAIN_SWITCH_ATTEMPTS) {
        throw new DrawingMainError(503, "主图切换繁忙，请稍后重试。", error);
      }
      await (dependencies?.sleep ?? defaultSleep)(attempt * 20);
    }
  }
  throw new DrawingMainError(503, "主图切换繁忙，请稍后重试。");
}
