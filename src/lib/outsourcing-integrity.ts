import {
  Prisma,
  type OrderStatus,
  type OutsourceType,
  type PrismaClient,
  type ProductPartStatus,
  type ProductStatus
} from "@prisma/client";
import { normalizeOptional, pickOutsourceDrawing } from "@/lib/outsource";
import {
  calculateOrderStatusFromProducts,
  calculateProtectedProductStatus
} from "@/lib/product-progress";

export const MAX_OUTSOURCE_CREATE_ATTEMPTS = 3;
const PRISMA_INT_MAX = 2_147_483_647;
const outsourceTypes = new Set<OutsourceType>([
  "ELECTROPLATING",
  "POWDER_COATING",
  "OXIDATION",
  "WIRE_DRAWING",
  "OTHER"
]);
const allowedPartStatuses = new Set<ProductPartStatus>([
  "WAIT_OUTSOURCE",
  "OUTSOURCING",
  "PARTIAL_RETURN",
  "RETURNED"
]);
const blockedProductStatuses = new Set<ProductStatus>([
  "ABNORMAL",
  "PARTIAL_DELIVERED",
  "COMPLETED"
]);
const blockedOrderStatuses = new Set<OrderStatus>([
  "ABNORMAL",
  "COMPLETED"
]);

export class OutsourcingIntegrityError extends Error {
  readonly status: number;
  readonly cause?: unknown;

  constructor(status: number, message: string, cause?: unknown) {
    super(message);
    this.name = "OutsourcingIntegrityError";
    this.status = status;
    this.cause = cause;
  }
}

type RawOutsourceItem = {
  partId?: unknown;
  outsourceQuantity?: unknown;
  remark?: unknown;
};

type ValidatedOutsourceItem = {
  partId: string;
  outsourceQuantity: number;
  remark: string | null;
};

type ValidatedOutsourceInput = {
  supplierName: string;
  outsourceType: OutsourceType;
  outsourceDate: Date;
  outsourceDateKey: string;
  expectedReturnDate: Date | null;
  handler: string | null;
  remark: string | null;
  items: ValidatedOutsourceItem[];
};

export type OutsourcingIntegrityDependencies = {
  sleep?: (milliseconds: number) => Promise<void>;
  beforeTransactionAttempt?: (attempt: number) => Promise<void>;
  afterNumberAllocated?: (context: {
    tx: Prisma.TransactionClient;
    attempt: number;
    outsourceNo: string;
  }) => Promise<void>;
  afterSnapshotsValidated?: (context: {
    tx: Prisma.TransactionClient;
    attempt: number;
    outsourceNo: string;
  }) => Promise<void>;
  beforePartConditionalUpdate?: (context: {
    tx: Prisma.TransactionClient;
    attempt: number;
    partId: string;
  }) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStrictLocalDate(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function parseOutsourceQuantity(value: unknown) {
  let quantity: number;
  if (typeof value === "number") {
    quantity = value;
  } else if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    quantity = Number(value);
  } else {
    return null;
  }

  if (
    !Number.isSafeInteger(quantity)
    || quantity <= 0
    || quantity > PRISMA_INT_MAX
  ) {
    return null;
  }
  return quantity;
}

function validateInput(input: unknown): ValidatedOutsourceInput {
  if (!isRecord(input)) {
    throw new OutsourcingIntegrityError(400, "请求格式错误。");
  }

  const supplierName = typeof input.supplierName === "string" ? input.supplierName.trim() : "";
  if (!supplierName) {
    throw new OutsourcingIntegrityError(400, "供应商不能为空。");
  }

  if (typeof input.outsourceType !== "string" || !outsourceTypes.has(input.outsourceType as OutsourceType)) {
    throw new OutsourcingIntegrityError(400, "外发类型无效。");
  }

  const outsourceDateValue = input.outsourceDate;
  const outsourceDate = parseStrictLocalDate(outsourceDateValue);
  if (!outsourceDate) {
    throw new OutsourcingIntegrityError(400, "外发日期格式错误。");
  }

  let expectedReturnDate: Date | null = null;
  if (input.expectedReturnDate !== undefined && input.expectedReturnDate !== null && input.expectedReturnDate !== "") {
    expectedReturnDate = parseStrictLocalDate(input.expectedReturnDate);
    if (!expectedReturnDate) {
      throw new OutsourcingIntegrityError(400, "外发日期格式错误。");
    }
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new OutsourcingIntegrityError(400, "请至少添加一个外发部件。");
  }

  const partIds = new Set<string>();
  const items: ValidatedOutsourceItem[] = [];
  for (const rawItem of input.items as RawOutsourceItem[]) {
    const partId = typeof rawItem?.partId === "string" ? rawItem.partId : "";
    if (!partId || partId !== partId.trim()) {
      throw new OutsourcingIntegrityError(400, "外发部件信息无效。");
    }
    if (partIds.has(partId)) {
      throw new OutsourcingIntegrityError(400, "同一部件不能重复添加。");
    }
    partIds.add(partId);

    const outsourceQuantity = parseOutsourceQuantity(rawItem?.outsourceQuantity);
    if (outsourceQuantity === null) {
      throw new OutsourcingIntegrityError(400, "外发数量必须是大于0的安全整数。");
    }
    items.push({
      partId,
      outsourceQuantity,
      remark: normalizeOptional(rawItem?.remark)
    });
  }

  return {
    supplierName,
    outsourceType: input.outsourceType as OutsourceType,
    outsourceDate,
    outsourceDateKey: outsourceDateValue as string,
    expectedReturnDate,
    handler: normalizeOptional(input.handler),
    remark: normalizeOptional(input.remark),
    items
  };
}

function isKnownPrismaError(error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export function isOutsourceNumberConflict(error: unknown) {
  if (!isKnownPrismaError(error, "P2002")) return false;
  if (error.meta?.modelName !== undefined && error.meta.modelName !== "OutsourceOrder") return false;

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.length === 1 && target[0] === "outsourceNo";
  }
  return target === "outsourceNo";
}

export function isTransientOutsourcingSqliteError(error: unknown) {
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

function assertStoredQuantity(value: number, { positive = false }: { positive?: boolean } = {}) {
  return Number.isSafeInteger(value)
    && value >= (positive ? 1 : 0)
    && value <= PRISMA_INT_MAX;
}

function assertPartCanBeOutsourced(part: {
  status: ProductPartStatus;
  totalQuantity: number;
  outsourcedQuantity: number;
  returnedQuantity: number;
  missingQuantity: number;
}) {
  if (!allowedPartStatuses.has(part.status)) {
    throw new OutsourcingIntegrityError(409, "当前部件状态不允许外发。");
  }
  if (
    !assertStoredQuantity(part.totalQuantity, { positive: true })
    || !assertStoredQuantity(part.outsourcedQuantity)
    || !assertStoredQuantity(part.returnedQuantity)
    || !assertStoredQuantity(part.missingQuantity)
    || part.outsourcedQuantity > part.totalQuantity
    || part.returnedQuantity > part.totalQuantity
  ) {
    throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }

  if (part.status === "RETURNED") {
    const isReturnedWithRemainingQuantity =
      part.outsourcedQuantity > 0
      && part.outsourcedQuantity < part.totalQuantity
      && part.returnedQuantity === part.outsourcedQuantity
      && part.missingQuantity === 0;
    const isNeverOutsourcedComplete =
      part.outsourcedQuantity === 0
      && part.returnedQuantity === part.totalQuantity
      && part.missingQuantity === 0;
    if (isNeverOutsourcedComplete) {
      throw new OutsourcingIntegrityError(409, "当前部件状态不允许外发。");
    }
    if (!isReturnedWithRemainingQuantity) {
      throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。");
    }
    return;
  }

  if (
    part.returnedQuantity > part.outsourcedQuantity
    || part.missingQuantity !== part.outsourcedQuantity - part.returnedQuantity
  ) {
    throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }
  if (
    part.status === "WAIT_OUTSOURCE"
    && (
      part.outsourcedQuantity !== 0
      || part.returnedQuantity !== 0
      || part.missingQuantity !== 0
    )
  ) {
    throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }
  if (
    part.status === "OUTSOURCING"
    && (part.outsourcedQuantity <= 0 || part.missingQuantity <= 0)
  ) {
    throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }
  if (
    part.status === "PARTIAL_RETURN"
    && (
      part.outsourcedQuantity <= 0
      || part.returnedQuantity <= 0
      || part.returnedQuantity >= part.outsourcedQuantity
      || part.missingQuantity <= 0
    )
  ) {
    throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }
}

async function allocateOutsourceNumber(
  tx: Prisma.TransactionClient,
  outsourceDateKey: string
) {
  const dateDigits = outsourceDateKey.replaceAll("-", "");
  const prefix = `WF${dateDigits}`;
  const existing = await tx.outsourceOrder.findMany({
    where: {
      outsourceNo: {
        startsWith: prefix
      }
    },
    select: {
      outsourceNo: true
    }
  });
  const exactNumber = new RegExp(`^${prefix}(\\d{3})$`);
  let maximumSerial = 0;
  for (const order of existing) {
    const match = exactNumber.exec(order.outsourceNo);
    if (!match) continue;
    const serial = Number(match[1]);
    if (serial > maximumSerial) maximumSerial = serial;
  }
  if (maximumSerial >= 999) {
    throw new OutsourcingIntegrityError(409, "当日外发单数量已达到上限。");
  }
  return `${prefix}${String(maximumSerial + 1).padStart(3, "0")}`;
}

async function updateProductFromLatestParts(
  tx: Prisma.TransactionClient,
  productId: string,
  expectedStatus: ProductStatus
) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      status: true,
      parts: {
        select: {
          status: true
        }
      }
    }
  });
  if (!product || product.status !== expectedStatus) {
    throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }

  const status = calculateProtectedProductStatus(product.status, product.parts);
  if (status === product.status) return;

  const update = await tx.product.updateMany({
    where: {
      id: product.id,
      status: product.status
    },
    data: {
      status
    }
  });
  if (update.count !== 1) {
    throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }
}

async function updateOrderFromLatestProducts(
  tx: Prisma.TransactionClient,
  orderId: string,
  expectedStatus: OrderStatus
) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      products: {
        select: {
          status: true
        }
      }
    }
  });
  if (!order || order.status !== expectedStatus) {
    throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }

  const status = calculateOrderStatusFromProducts(order.status, order.products);
  if (status === order.status) return;

  const update = await tx.order.updateMany({
    where: {
      id: order.id,
      status: order.status
    },
    data: {
      status
    }
  });
  if (update.count !== 1) {
    throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }
}

async function createOutsourceOrderAttempt(
  tx: Prisma.TransactionClient,
  input: ValidatedOutsourceInput,
  attempt: number,
  dependencies?: OutsourcingIntegrityDependencies
) {
  const outsourceNo = await allocateOutsourceNumber(tx, input.outsourceDateKey);
  await dependencies?.afterNumberAllocated?.({ tx, attempt, outsourceNo });

  const partIds = input.items.map((item) => item.partId);
  const parts = await tx.productPart.findMany({
    where: {
      id: {
        in: partIds
      }
    },
    include: {
      product: {
        select: {
          id: true,
          productName: true,
          status: true
        }
      },
      order: {
        select: {
          id: true,
          orderNo: true,
          status: true
        }
      },
      drawings: {
        orderBy: [
          { isMain: "desc" },
          { version: "desc" },
          { createdAt: "desc" }
        ]
      }
    }
  });
  if (parts.length !== partIds.length) {
    throw new OutsourcingIntegrityError(404, "部分外发部件不存在，请刷新后重试。");
  }

  const partsById = new Map(parts.map((part) => [part.id, part]));
  const preparedItems = input.items.map((item) => {
    const part = partsById.get(item.partId);
    if (!part) {
      throw new OutsourcingIntegrityError(404, "部分外发部件不存在，请刷新后重试。");
    }
    assertPartCanBeOutsourced(part);
    if (blockedProductStatuses.has(part.product.status)) {
      throw new OutsourcingIntegrityError(409, "当前产品状态不允许外发。");
    }
    if (blockedOrderStatuses.has(part.order.status)) {
      throw new OutsourcingIntegrityError(409, "当前订单状态不允许外发。");
    }

    const availableQuantity = part.totalQuantity - part.outsourcedQuantity;
    if (availableQuantity <= 0 || item.outsourceQuantity > availableQuantity) {
      throw new OutsourcingIntegrityError(409, "可外发数量已变化，请刷新后重试。");
    }
    return {
      input: item,
      part,
      drawing: pickOutsourceDrawing(part.drawings)
    };
  });

  await dependencies?.afterSnapshotsValidated?.({ tx, attempt, outsourceNo });

  const order = await tx.outsourceOrder.create({
    data: {
      outsourceNo,
      supplierName: input.supplierName,
      outsourceType: input.outsourceType,
      outsourceDate: input.outsourceDate,
      expectedReturnDate: input.expectedReturnDate,
      handler: input.handler,
      status: "OUTSOURCED",
      remark: input.remark
    }
  });

  const productStatuses = new Map<string, ProductStatus>();
  const orderStatuses = new Map<string, OrderStatus>();
  for (const prepared of preparedItems) {
    const { input: item, part, drawing } = prepared;
    productStatuses.set(part.productId, part.product.status);
    orderStatuses.set(part.orderId, part.order.status);

    await tx.outsourceOrderItem.create({
      data: {
        outsourceOrderId: order.id,
        orderId: part.orderId,
        productId: part.productId,
        partId: part.id,
        drawingId: drawing?.id ?? null,
        partName: part.partName,
        productName: part.product.productName,
        surfaceTreatment: part.surfaceTreatment,
        color: part.color,
        outsourceQuantity: item.outsourceQuantity,
        returnedQuantity: 0,
        missingQuantity: item.outsourceQuantity,
        thumbnailUrl: drawing?.thumbnailUrl ?? drawing?.printThumbnailUrl ?? null,
        originalUrl: drawing?.originalUrl ?? null,
        status: "OUTSOURCED",
        remark: item.remark
      }
    });

    await dependencies?.beforePartConditionalUpdate?.({
      tx,
      attempt,
      partId: part.id
    });
    const partUpdate = await tx.productPart.updateMany({
      where: {
        id: part.id,
        status: part.status,
        totalQuantity: part.totalQuantity,
        outsourcedQuantity: part.outsourcedQuantity,
        returnedQuantity: part.returnedQuantity,
        missingQuantity: part.missingQuantity
      },
      data: {
        outsourcedQuantity: {
          increment: item.outsourceQuantity
        },
        missingQuantity: {
          increment: item.outsourceQuantity
        },
        status: "OUTSOURCING"
      }
    });
    if (partUpdate.count !== 1) {
      throw new OutsourcingIntegrityError(409, "可外发数量已变化，请刷新后重试。");
    }
  }

  for (const [productId, status] of productStatuses) {
    await updateProductFromLatestParts(tx, productId, status);
  }
  for (const [orderId, status] of orderStatuses) {
    await updateOrderFromLatestProducts(tx, orderId, status);
  }
  return order;
}

export async function createOutsourceOrderIntegrity({
  client,
  input: rawInput,
  dependencies
}: {
  client: PrismaClient;
  input: unknown;
  dependencies?: OutsourcingIntegrityDependencies;
}) {
  const input = validateInput(rawInput);
  for (let attempt = 1; attempt <= MAX_OUTSOURCE_CREATE_ATTEMPTS; attempt += 1) {
    await dependencies?.beforeTransactionAttempt?.(attempt);
    try {
      return await client.$transaction((tx) => (
        createOutsourceOrderAttempt(tx, input, attempt, dependencies)
      ));
    } catch (error) {
      if (error instanceof OutsourcingIntegrityError) throw error;
      if (isOutsourceNumberConflict(error)) {
        if (attempt === MAX_OUTSOURCE_CREATE_ATTEMPTS) {
          throw new OutsourcingIntegrityError(409, "外发单编号冲突，请重新提交。", error);
        }
        await (dependencies?.sleep ?? defaultSleep)(attempt * 20);
        continue;
      }
      if (isKnownPrismaError(error, "P2002")) {
        throw new OutsourcingIntegrityError(409, "数据发生唯一性冲突，请刷新后重试。", error);
      }
      if (isKnownPrismaError(error, "P2003")) {
        throw new OutsourcingIntegrityError(409, "关联数据已变化，请刷新后重试。", error);
      }
      if (isKnownPrismaError(error, "P2025")) {
        throw new OutsourcingIntegrityError(409, "数据状态已变化，请刷新后重试。", error);
      }
      if (!isTransientOutsourcingSqliteError(error)) {
        throw new OutsourcingIntegrityError(500, "创建外发单失败，请稍后重试。", error);
      }
      if (attempt === MAX_OUTSOURCE_CREATE_ATTEMPTS) {
        throw new OutsourcingIntegrityError(503, "系统繁忙，请稍后重试。", error);
      }
      await (dependencies?.sleep ?? defaultSleep)(attempt * 20);
    }
  }
  throw new OutsourcingIntegrityError(503, "系统繁忙，请稍后重试。");
}
