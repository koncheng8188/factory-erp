import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/authorization";
import { calculateKittingResult } from "@/lib/kitting";
import { KittingManager } from "./kitting-manager";

export const dynamic = "force-dynamic";

type KittingPageProps = {
  searchParams: Promise<{ productId?: string }>;
};

export default async function KittingPage({ searchParams }: KittingPageProps) {
  await requirePagePermission("kitting.view");

  const { productId } = await searchParams;
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      order: {
        select: {
          id: true,
          orderNo: true,
          customerName: true
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

  const kittingProducts = products.map((product) => {
    const result = calculateKittingResult(product);
    return {
      id: product.id,
      orderId: product.orderId,
      orderNo: product.order.orderNo,
      customerName: product.order.customerName,
      productName: product.productName,
      specification: product.specification,
      quantity: product.quantity,
      status: product.status,
      partCount: product.parts.length,
      hasParts: result.hasParts,
      isQuantityComplete: result.isQuantityComplete,
      hasAbnormal: result.hasAbnormal,
      message: result.message,
      missingParts: result.missingParts,
      parts: result.parts
    };
  });

  return <KittingManager products={kittingProducts} selectedProductId={productId ?? null} />;
}
