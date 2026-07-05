import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";

type KittingPart = {
  id: string;
  partName: string;
  partCode: string | null;
  totalQuantity: number;
  outsourcedQuantity: number;
  returnedQuantity: number;
  status: string;
};

type KittingProduct = {
  id: string;
  orderId: string;
  productName: string;
  specification: string | null;
  quantity: number;
  status: string;
  parts: KittingPart[];
};

export type KittingMissingPart = {
  id: string;
  partName: string;
  partCode: string | null;
  missingQuantity: number;
};

export type KittingPartResult = KittingPart & {
  missingQuantity: number;
};

export type KittingResult = {
  hasParts: boolean;
  isQuantityComplete: boolean;
  hasAbnormal: boolean;
  canUpdateToWaitDelivery: boolean;
  message: string;
  missingParts: KittingMissingPart[];
  parts: KittingPartResult[];
};

type KittingTx = Prisma.TransactionClient | typeof prisma;

const protectedProductStatuses = new Set(["ABNORMAL", "PARTIAL_DELIVERED", "COMPLETED"]);
const deliveryReadyProductStatuses = new Set(["WAIT_DELIVERY", "PARTIAL_DELIVERED", "COMPLETED"]);

export function calculateMissingQuantity(part: Pick<KittingPart, "totalQuantity" | "returnedQuantity">) {
  return Math.max(part.totalQuantity - part.returnedQuantity, 0);
}

export function calculateKittingResult(product: KittingProduct): KittingResult {
  const parts = product.parts.map((part) => ({
    ...part,
    missingQuantity: calculateMissingQuantity(part)
  }));
  const hasParts = parts.length > 0;
  const missingParts = parts
    .filter((part) => part.missingQuantity > 0)
    .map((part) => ({
      id: part.id,
      partName: part.partName,
      partCode: part.partCode,
      missingQuantity: part.missingQuantity
    }));
  const isQuantityComplete = hasParts && missingParts.length === 0;
  const hasAbnormal = product.status === "ABNORMAL" || parts.some((part) => part.status === "ABNORMAL");
  const canUpdateToWaitDelivery = isQuantityComplete && !hasAbnormal && !protectedProductStatuses.has(product.status);

  let message = "已齐套";
  if (!hasParts) {
    message = "未维护部件";
  } else if (missingParts.length > 0) {
    message = missingParts.map((part) => `${part.partName}缺 ${part.missingQuantity} 件`).join("，");
  } else if (hasAbnormal) {
    message = "数量已齐，但存在异常记录";
  }

  return {
    hasParts,
    isQuantityComplete,
    hasAbnormal,
    canUpdateToWaitDelivery,
    message,
    missingParts,
    parts
  };
}

export async function getProductKitting(tx: KittingTx, productId: string) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    include: {
      order: {
        select: {
          id: true,
          orderNo: true,
          customerName: true,
          status: true
        }
      },
      parts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          partName: true,
          partCode: true,
          totalQuantity: true,
          outsourcedQuantity: true,
          returnedQuantity: true,
          status: true
        }
      }
    }
  });

  if (!product) {
    return null;
  }

  return {
    product,
    result: calculateKittingResult(product)
  };
}

export async function syncOrderKittingStatus(tx: KittingTx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      products: {
        select: {
          status: true
        }
      }
    }
  });

  if (!order || order.products.length === 0 || order.status === "PARTIAL_DELIVERED" || order.status === "COMPLETED") {
    return;
  }

  const allCompleted = order.products.every((product) => product.status === "COMPLETED");
  const allReady = order.products.every((product) => deliveryReadyProductStatuses.has(product.status));

  if (allCompleted) {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "COMPLETED" }
    });
    return;
  }

  if (allReady) {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "WAIT_DELIVERY" }
    });
  }
}

export async function refreshProductKittingStatus(tx: KittingTx, productId: string) {
  const kitting = await getProductKitting(tx, productId);
  if (!kitting) {
    return null;
  }

  const { product, result } = kitting;
  let updatedProductStatus = product.status;

  if (result.canUpdateToWaitDelivery && product.status !== "WAIT_DELIVERY") {
    await tx.product.update({
      where: { id: product.id },
      data: { status: "WAIT_DELIVERY" }
    });
    updatedProductStatus = "WAIT_DELIVERY";
  }

  await syncOrderKittingStatus(tx, product.orderId);

  return {
    product: {
      ...product,
      status: updatedProductStatus
    },
    result
  };
}

export async function refreshKittingForProducts(tx: KittingTx, productIds: string[]) {
  const uniqueProductIds = Array.from(new Set(productIds));
  const results = [];
  for (const productId of uniqueProductIds) {
    const result = await refreshProductKittingStatus(tx, productId);
    if (result) {
      results.push(result);
    }
  }
  return results;
}
