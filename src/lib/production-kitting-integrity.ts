import {
  Prisma,
  type OrderStatus,
  type PrismaClient,
  type ProductPartStatus,
  type ProductStatus
} from "@prisma/client";
import { calculateKittingResult, calculateKittingRollbackStatus } from "@/lib/kitting";
import {
  calculateOrderStatusFromProducts,
  calculateProtectedProductStatus,
  getNextPartStatus
} from "@/lib/product-progress";

export const MAX_PRODUCTION_WRITE_ATTEMPTS = 3;

export class ProductionKittingError extends Error {
  readonly status: number;
  readonly cause?: unknown;

  constructor(status: number, message: string, cause?: unknown) {
    super(message);
    this.name = "ProductionKittingError";
    this.status = status;
    this.cause = cause;
  }
}

type OperationName = "advance" | "report-abnormal" | "resolve-abnormal" | "complete-product" | "refresh-kitting";

export type ProductionKittingDependencies = {
  sleep?: (milliseconds: number) => Promise<void>;
  beforeAttempt?: (operation: OperationName, attempt: number) => Promise<void>;
  beforeConditionalUpdate?: (operation: OperationName, attempt: number) => Promise<void>;
};

const deliveryControlledProductStatuses = new Set<ProductStatus>(["PARTIAL_DELIVERED", "COMPLETED"]);
const deliveryControlledOrderStatuses = new Set<OrderStatus>(["PARTIAL_DELIVERED", "COMPLETED"]);

function isKnownPrismaError(error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export function isTransientProductionSqliteError(error: unknown) {
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

function concurrentStateError(cause?: unknown) {
  return new ProductionKittingError(409, "数据状态已变化，请刷新后重试。", cause);
}

function getAdvanceActionName(fromStatus: ProductPartStatus, toStatus: ProductPartStatus) {
  if ((fromStatus === "PENDING" || fromStatus === "CUTTING") && toStatus === "WELDING") {
    return "完成下料，进入焊接";
  }
  if (fromStatus === "WELDING" && toStatus === "POLISHING") {
    return "完成焊接，进入抛光";
  }
  if (fromStatus === "POLISHING" && toStatus === "WAIT_OUTSOURCE") {
    return "完成抛光，进入待外发";
  }
  return null;
}

async function runProductionWrite<T>(
  operation: OperationName,
  client: PrismaClient,
  work: (tx: Prisma.TransactionClient, attempt: number) => Promise<T>,
  dependencies?: ProductionKittingDependencies
) {
  for (let attempt = 1; attempt <= MAX_PRODUCTION_WRITE_ATTEMPTS; attempt += 1) {
    await dependencies?.beforeAttempt?.(operation, attempt);
    try {
      return await client.$transaction((tx) => work(tx, attempt));
    } catch (error) {
      if (error instanceof ProductionKittingError) throw error;
      if (isKnownPrismaError(error, "P2002") || isKnownPrismaError(error, "P2003") || isKnownPrismaError(error, "P2025")) {
        throw concurrentStateError(error);
      }
      if (!isTransientProductionSqliteError(error)) {
        throw new ProductionKittingError(500, "操作失败，请稍后重试。", error);
      }
      if (attempt === MAX_PRODUCTION_WRITE_ATTEMPTS) {
        throw new ProductionKittingError(503, "系统繁忙，请稍后重试。", error);
      }
      await (dependencies?.sleep ?? defaultSleep)(attempt * 20);
    }
  }
  throw new ProductionKittingError(503, "系统繁忙，请稍后重试。");
}

async function updateProductFromActualParts(tx: Prisma.TransactionClient, productId: string) {
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
  if (!product) throw new ProductionKittingError(404, "产品不存在。");

  const status = calculateProtectedProductStatus(product.status, product.parts);
  if (status === product.status) return product;

  const update = await tx.product.updateMany({
    where: {
      id: product.id,
      status: product.status
    },
    data: { status }
  });
  if (update.count !== 1) throw concurrentStateError();
  return { id: product.id, status };
}

async function updateOrderFromActualProducts(tx: Prisma.TransactionClient, orderId: string) {
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
  if (!order) throw new ProductionKittingError(404, "订单不存在。");

  const status = calculateOrderStatusFromProducts(order.status, order.products);
  if (status === order.status) return order;

  const update = await tx.order.updateMany({
    where: {
      id: order.id,
      status: order.status
    },
    data: { status }
  });
  if (update.count !== 1) throw concurrentStateError();
  return { id: order.id, status };
}

export async function advancePartProduction({
  client,
  partId,
  expectedStatus,
  dependencies
}: {
  client: PrismaClient;
  partId: string;
  expectedStatus: ProductPartStatus;
  dependencies?: ProductionKittingDependencies;
}) {
  return runProductionWrite("advance", client, async (tx, attempt) => {
    const part = await tx.productPart.findUnique({
      where: { id: partId },
      select: {
        id: true,
        orderId: true,
        productId: true,
        status: true,
        order: {
          select: {
            status: true
          }
        },
        product: {
          select: {
            id: true
          }
        }
      }
    });
    if (!part) throw new ProductionKittingError(404, "部件不存在。");
    if (part.order.status === "COMPLETED") {
      throw new ProductionKittingError(409, "已完成订单不能执行生产操作。");
    }
    if (part.status !== expectedStatus) throw concurrentStateError();

    const nextStatus = getNextPartStatus(part.status);
    const actionName = nextStatus ? getAdvanceActionName(part.status, nextStatus) : null;
    if (!nextStatus || !actionName) {
      throw new ProductionKittingError(400, "当前状态不允许执行此操作。");
    }

    await dependencies?.beforeConditionalUpdate?.("advance", attempt);
    const update = await tx.productPart.updateMany({
      where: {
        id: part.id,
        status: expectedStatus
      },
      data: {
        status: nextStatus
      }
    });
    if (update.count !== 1) throw concurrentStateError();

    const progressLog = await tx.productPartProgressLog.create({
      data: {
        productPartId: part.id,
        productId: part.productId,
        orderId: part.orderId,
        fromStatus: part.status,
        toStatus: nextStatus,
        actionName
      },
      select: {
        id: true,
        occurredAt: true,
        actionName: true
      }
    });
    const product = await updateProductFromActualParts(tx, part.productId);
    if (part.order.status === "PENDING") {
      const orderUpdate = await tx.order.updateMany({
        where: {
          id: part.orderId,
          status: "PENDING"
        },
        data: {
          status: "PRODUCING"
        }
      });
      if (orderUpdate.count !== 1) throw concurrentStateError();
    }

    return {
      part: {
        id: part.id,
        productId: part.productId,
        status: nextStatus
      },
      progressLog,
      product
    };
  }, dependencies);
}

export async function reportPartAbnormal({
  client,
  partId,
  reason,
  dependencies
}: {
  client: PrismaClient;
  partId: string;
  reason: string;
  dependencies?: ProductionKittingDependencies;
}) {
  return runProductionWrite("report-abnormal", client, async (tx, attempt) => {
    const part = await tx.productPart.findUnique({
      where: { id: partId },
      select: {
        id: true,
        orderId: true,
        productId: true,
        status: true,
        order: {
          select: {
            status: true
          }
        },
        product: {
          select: {
            status: true
          }
        }
      }
    });
    if (!part) throw new ProductionKittingError(404, "部件不存在。");
    if (part.order.status === "COMPLETED") {
      throw new ProductionKittingError(409, "已完成订单不能执行生产操作。");
    }
    if (part.status === "ABNORMAL") {
      throw new ProductionKittingError(409, "该部件已有未处理异常。");
    }

    const openAbnormal = await tx.productPartAbnormal.findFirst({
      where: {
        productPartId: part.id,
        status: "OPEN"
      },
      select: {
        id: true
      }
    });
    if (openAbnormal) throw new ProductionKittingError(409, "该部件已有未处理异常。");

    await dependencies?.beforeConditionalUpdate?.("report-abnormal", attempt);
    const partUpdate = await tx.productPart.updateMany({
      where: {
        id: part.id,
        status: part.status
      },
      data: {
        status: "ABNORMAL"
      }
    });
    if (partUpdate.count !== 1) throw concurrentStateError();

    const abnormal = await tx.productPartAbnormal.create({
      data: {
        productPartId: part.id,
        productId: part.productId,
        orderId: part.orderId,
        fromStatus: part.status,
        reason,
        status: "OPEN"
      },
      select: {
        id: true,
        status: true,
        createdAt: true
      }
    });
    const product = await updateProductFromActualParts(tx, part.productId);
    return {
      abnormal,
      part: {
        id: part.id,
        status: "ABNORMAL" as const
      },
      product
    };
  }, dependencies);
}

export async function resolvePartAbnormal({
  client,
  partId,
  requestedStatus,
  resolvedRemark,
  dependencies
}: {
  client: PrismaClient;
  partId: string;
  requestedStatus?: ProductPartStatus;
  resolvedRemark: string;
  dependencies?: ProductionKittingDependencies;
}) {
  return runProductionWrite("resolve-abnormal", client, async (tx, attempt) => {
    const abnormal = await tx.productPartAbnormal.findFirst({
      where: {
        productPartId: partId,
        status: "OPEN"
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        productId: true,
        productPartId: true,
        fromStatus: true,
        status: true,
        productPart: {
          select: {
            status: true
          }
        }
      }
    });
    if (!abnormal) throw new ProductionKittingError(404, "未找到待处理异常。");
    if (requestedStatus !== undefined && requestedStatus !== abnormal.fromStatus) {
      throw new ProductionKittingError(400, "异常只能恢复到登记前状态。");
    }
    if (abnormal.productPart.status !== "ABNORMAL") throw concurrentStateError();

    await dependencies?.beforeConditionalUpdate?.("resolve-abnormal", attempt);
    const abnormalUpdate = await tx.productPartAbnormal.updateMany({
      where: {
        id: abnormal.id,
        status: "OPEN"
      },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedRemark: resolvedRemark || null
      }
    });
    if (abnormalUpdate.count !== 1) throw concurrentStateError();

    const partUpdate = await tx.productPart.updateMany({
      where: {
        id: abnormal.productPartId,
        status: "ABNORMAL"
      },
      data: {
        status: abnormal.fromStatus
      }
    });
    if (partUpdate.count !== 1) throw concurrentStateError();

    const resolvedAbnormal = await tx.productPartAbnormal.findUnique({
      where: { id: abnormal.id },
      select: {
        id: true,
        status: true,
        resolvedAt: true
      }
    });
    const product = await updateProductFromActualParts(tx, abnormal.productId);
    return {
      abnormal: resolvedAbnormal,
      part: {
        id: abnormal.productPartId,
        status: abnormal.fromStatus
      },
      product
    };
  }, dependencies);
}

export async function markProductProductionComplete({
  client,
  productId,
  dependencies
}: {
  client: PrismaClient;
  productId: string;
  dependencies?: ProductionKittingDependencies;
}) {
  return runProductionWrite("complete-product", client, async (tx, attempt) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        orderId: true,
        status: true,
        order: {
          select: {
            status: true
          }
        },
        parts: {
          select: {
            id: true,
            status: true,
            totalQuantity: true,
            outsourcedQuantity: true,
            returnedQuantity: true,
            missingQuantity: true
          }
        },
        partAbnormals: {
          where: {
            status: "OPEN"
          },
          select: {
            id: true
          }
        }
      }
    });
    if (!product) throw new ProductionKittingError(404, "产品不存在。");
    if (product.order.status === "COMPLETED") {
      throw new ProductionKittingError(409, "已完成订单不能执行生产操作。");
    }
    if (product.parts.length === 0) {
      throw new ProductionKittingError(400, "产品未维护部件，不能标记生产完成。");
    }
    if (deliveryControlledProductStatuses.has(product.status)) {
      return { success: true };
    }
    if (product.partAbnormals.length > 0 || product.parts.some((part) => part.status === "ABNORMAL")) {
      throw new ProductionKittingError(409, "产品仍有未处理异常，不能标记生产完成。");
    }
    for (const part of product.parts) {
      if (
        part.outsourcedQuantity > 0
        && (
          part.returnedQuantity < part.totalQuantity
          || part.missingQuantity !== 0
          || part.returnedQuantity < part.outsourcedQuantity
        )
      ) {
        throw new ProductionKittingError(409, "部件外发尚未全部回厂，不能标记生产完成。");
      }
    }
    const isAlreadyComplete = product.status === "WAIT_DELIVERY" && product.parts.every((part) => (
      part.status === "RETURNED"
      && (
        part.outsourcedQuantity > 0
        || (part.returnedQuantity === part.totalQuantity && part.missingQuantity === 0)
      )
    ));
    if (isAlreadyComplete) return { success: true };

    await dependencies?.beforeConditionalUpdate?.("complete-product", attempt);
    for (const part of product.parts) {
      const isNeverOutsourced = part.outsourcedQuantity === 0;
      const isPartAlreadyComplete = part.status === "RETURNED"
        && (!isNeverOutsourced || (part.returnedQuantity === part.totalQuantity && part.missingQuantity === 0));
      if (isPartAlreadyComplete) continue;

      const update = await tx.productPart.updateMany({
        where: {
          id: part.id,
          status: part.status,
          totalQuantity: part.totalQuantity,
          outsourcedQuantity: part.outsourcedQuantity,
          returnedQuantity: part.returnedQuantity,
          missingQuantity: part.missingQuantity
        },
        data: isNeverOutsourced
          ? {
              status: "RETURNED",
              returnedQuantity: part.totalQuantity,
              missingQuantity: 0
            }
          : {
              status: "RETURNED"
            }
      });
      if (update.count !== 1) throw concurrentStateError();
    }

    const productUpdate = await tx.product.updateMany({
      where: {
        id: product.id,
        status: product.status
      },
      data: {
        status: "WAIT_DELIVERY"
      }
    });
    if (productUpdate.count !== 1) throw concurrentStateError();
    await updateOrderFromActualProducts(tx, product.orderId);
    return { success: true };
  }, dependencies);
}

export async function refreshKittingState({
  client,
  productId,
  dependencies
}: {
  client: PrismaClient;
  productId: string;
  dependencies?: ProductionKittingDependencies;
}) {
  return runProductionWrite("refresh-kitting", client, async (tx, attempt) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        orderId: true,
        productName: true,
        specification: true,
        quantity: true,
        status: true,
        order: {
          select: {
            id: true,
            orderNo: true,
            customerName: true,
            status: true
          }
        },
        parts: {
          orderBy: {
            createdAt: "asc"
          },
          select: {
            id: true,
            partName: true,
            partCode: true,
            totalQuantity: true,
            outsourcedQuantity: true,
            returnedQuantity: true,
            status: true
          }
        },
        partAbnormals: {
          where: {
            status: "OPEN"
          },
          select: {
            id: true
          }
        }
      }
    });
    if (!product) throw new ProductionKittingError(404, "产品不存在。");

    const { partAbnormals, ...publicProduct } = product;
    const result = calculateKittingResult(publicProduct, partAbnormals.length > 0);
    let updatedProductStatus = product.status;
    if (!deliveryControlledProductStatuses.has(product.status)) {
      if (result.isQuantityComplete && !result.hasAbnormal) {
        updatedProductStatus = "WAIT_DELIVERY";
      } else if (product.status === "WAIT_DELIVERY") {
        updatedProductStatus = calculateKittingRollbackStatus(product.parts);
      }
    }

    await dependencies?.beforeConditionalUpdate?.("refresh-kitting", attempt);
    if (updatedProductStatus !== product.status) {
      const productUpdate = await tx.product.updateMany({
        where: {
          id: product.id,
          status: product.status
        },
        data: {
          status: updatedProductStatus
        }
      });
      if (productUpdate.count !== 1) throw concurrentStateError();
    }
    await updateOrderFromActualProducts(tx, product.orderId);

    return {
      product: {
        ...publicProduct,
        status: updatedProductStatus
      },
      result
    };
  }, dependencies);
}
