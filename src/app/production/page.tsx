import type { Prisma } from "@prisma/client";
import { getProductPartStatusLabel } from "@/lib/product-part-status";
import { prisma } from "@/lib/prisma";
import { ProductionManager } from "./production-manager";

export const dynamic = "force-dynamic";

type ProductionPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ProductionPage({ searchParams }: ProductionPageProps) {
  const params = await searchParams;
  const keyword = firstQueryValue(params?.keyword).trim();
  const where: Prisma.ProductWhereInput = {};

  if (keyword) {
    where.OR = [
      { productName: { contains: keyword } },
      { specification: { contains: keyword } },
      { material: { contains: keyword } },
      { surfaceTreatment: { contains: keyword } },
      { order: { is: { orderNo: { contains: keyword } } } },
      { order: { is: { customer: { is: { name: { contains: keyword } } } } } },
      { parts: { some: { color: { contains: keyword } } } },
      { parts: { some: { partCode: { contains: keyword } } } },
      { parts: { some: { partName: { contains: keyword } } } }
    ];
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      order: {
        include: {
          customer: true
        }
      },
      parts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          partCode: true,
          partName: true,
          totalQuantity: true,
          outsourcedQuantity: true,
          returnedQuantity: true,
          missingQuantity: true,
          color: true,
          status: true,
          drawings: {
            select: {
              id: true
            }
          }
        }
      }
    }
  });

  const productionProducts = products.map((product) => {
    const colors = Array.from(
      new Set(product.parts.map((part) => part.color).filter((color): color is string => Boolean(color)))
    );
    const drawingCount = product.parts.reduce((total, part) => total + part.drawings.length, 0);
    const outsourcedTotal = product.parts.reduce((total, part) => total + part.outsourcedQuantity, 0);
    const returnedTotal = product.parts.reduce((total, part) => total + part.returnedQuantity, 0);
    const missingTotal = product.parts.reduce((total, part) => total + part.missingQuantity, 0);

    return {
      id: product.id,
      orderId: product.orderId,
      orderNo: product.order.orderNo,
      customerName: product.order.customer.name,
      productName: product.productName,
      specification: product.specification,
      material: product.material,
      quantity: product.quantity,
      surfaceTreatment: product.surfaceTreatment,
      colors,
      status: product.status,
      partCount: product.parts.length,
      drawingCount,
      outsourcedTotal,
      returnedTotal,
      missingTotal,
      parts: product.parts.map((part) => ({
        id: part.id,
        partCode: part.partCode,
        partName: part.partName,
        totalQuantity: part.totalQuantity,
        outsourcedQuantity: part.outsourcedQuantity,
        returnedQuantity: part.returnedQuantity,
        missingQuantity: part.missingQuantity,
        drawingCount: part.drawings.length,
        status: part.status,
        statusLabel: getProductPartStatusLabel(part.status)
      }))
    };
  });

  return <ProductionManager products={productionProducts} keyword={keyword} />;
}
