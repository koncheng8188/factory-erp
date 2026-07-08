import type { Prisma, ProductPartStatus, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ProductProgressTx = Prisma.TransactionClient | typeof prisma;

const deliveryControlledStatuses = new Set<ProductStatus>(["PARTIAL_DELIVERED", "COMPLETED"]);

export function getNextPartStatus(status: ProductPartStatus): ProductPartStatus | null {
  if (status === "PENDING" || status === "CUTTING") return "WELDING";
  if (status === "WELDING") return "POLISHING";
  if (status === "POLISHING") return "WAIT_OUTSOURCE";
  return null;
}

export function calculateProductStatusFromParts(parts: Array<{ status: ProductPartStatus }>): ProductStatus {
  if (parts.length === 0) return "PENDING";
  if (parts.some((part) => part.status === "ABNORMAL")) return "ABNORMAL";
  if (parts.some((part) => part.status === "PENDING" || part.status === "CUTTING")) return "CUTTING";
  if (parts.some((part) => part.status === "WELDING")) return "WELDING";
  if (parts.some((part) => part.status === "POLISHING")) return "POLISHING";
  if (parts.some((part) => part.status === "WAIT_OUTSOURCE")) return "WAIT_OUTSOURCE";
  if (parts.some((part) => part.status === "OUTSOURCING")) return "OUTSOURCING";
  if (parts.some((part) => part.status === "PARTIAL_RETURN")) return "PARTIAL_RETURN";
  if (parts.every((part) => part.status === "RETURNED")) return "WAIT_DELIVERY";
  return "PENDING";
}

export async function syncProductStatusFromParts(txOrProductId: ProductProgressTx | string, productId?: string) {
  const tx = typeof txOrProductId === "string" ? prisma : txOrProductId;
  const id = typeof txOrProductId === "string" ? txOrProductId : productId;

  if (!id) {
    throw new Error("缺少产品 ID。");
  }

  const product = await tx.product.findUnique({
    where: { id },
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

  if (!product) {
    return null;
  }

  if (deliveryControlledStatuses.has(product.status)) {
    return product;
  }

  const status = calculateProductStatusFromParts(product.parts);
  if (product.status === status) {
    return product;
  }

  return tx.product.update({
    where: { id: product.id },
    data: { status },
    select: {
      id: true,
      status: true
    }
  });
}
