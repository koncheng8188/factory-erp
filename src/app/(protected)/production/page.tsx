import type { Prisma, ProductStatus } from "@prisma/client";
import { requirePagePermission } from "@/lib/auth/authorization";
import { hasPermission } from "@/lib/permissions";
import { getProductPartStatusLabel } from "@/lib/product-part-status";
import { prisma } from "@/lib/prisma";
import { ProductionManager } from "./production-manager";

export const dynamic = "force-dynamic";

type ProductionPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type StageFilter =
  | "all"
  | "cutting"
  | "welding"
  | "polishing"
  | "waitOutsource"
  | "outsourcing"
  | "partialReturn"
  | "returned"
  | "waitDelivery"
  | "partialDelivered"
  | "completed"
  | "abnormal";

type QuickFilter = "all" | "todo" | "abnormal" | "waitOutsource" | "outsourcing" | "waitDelivery";

const stageStatusMap: Record<Exclude<StageFilter, "all">, ProductStatus[]> = {
  cutting: ["PENDING", "CUTTING"],
  welding: ["WELDING"],
  polishing: ["POLISHING"],
  waitOutsource: ["WAIT_OUTSOURCE"],
  outsourcing: ["OUTSOURCING"],
  partialReturn: ["PARTIAL_RETURN"],
  returned: ["RETURNED"],
  waitDelivery: ["WAIT_DELIVERY"],
  partialDelivered: ["PARTIAL_DELIVERED"],
  completed: ["COMPLETED"],
  abnormal: ["ABNORMAL"]
};

const validStages = new Set<StageFilter>(["all", ...Object.keys(stageStatusMap) as Exclude<StageFilter, "all">[]]);
const validQuicks = new Set<QuickFilter>(["all", "todo", "abnormal", "waitOutsource", "outsourcing", "waitDelivery"]);

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseStage(value: string): StageFilter {
  return validStages.has(value as StageFilter) ? value as StageFilter : "all";
}

function parseQuick(value: string): QuickFilter {
  return validQuicks.has(value as QuickFilter) ? value as QuickFilter : "all";
}

function quickWhere(quick: QuickFilter): Prisma.ProductWhereInput | null {
  if (quick === "todo") {
    return { status: { notIn: ["COMPLETED", "ABNORMAL"] } };
  }
  if (quick === "abnormal") {
    return {
      OR: [
        { status: "ABNORMAL" },
        { parts: { some: { status: "ABNORMAL" } } }
      ]
    };
  }
  if (quick === "waitOutsource") {
    return {
      OR: [
        { status: "WAIT_OUTSOURCE" },
        { parts: { some: { status: "WAIT_OUTSOURCE" } } }
      ]
    };
  }
  if (quick === "outsourcing") {
    return {
      OR: [
        { status: { in: ["OUTSOURCING", "PARTIAL_RETURN"] } },
        { parts: { some: { status: { in: ["OUTSOURCING", "PARTIAL_RETURN"] } } } }
      ]
    };
  }
  if (quick === "waitDelivery") {
    return { status: { in: ["WAIT_DELIVERY", "PARTIAL_DELIVERED"] } };
  }
  return null;
}

export default async function ProductionPage({ searchParams }: ProductionPageProps) {
  const user = await requirePagePermission("production.view");
  const canPrintProduction = hasPermission(user.role, "production.print", []);
  const canUpdateProductionProgress =
    hasPermission(user.role, "order.view", []) &&
    hasPermission(user.role, "product.view", []) &&
    hasPermission(user.role, "part.view", []) &&
    hasPermission(user.role, "production.view", []) &&
    hasPermission(user.role, "production.updateProgress", []);
  const canReportProductionAbnormal =
    hasPermission(user.role, "order.view", []) &&
    hasPermission(user.role, "product.view", []) &&
    hasPermission(user.role, "part.view", []) &&
    hasPermission(user.role, "production.view", []) &&
    hasPermission(user.role, "production.reportAbnormal", []);

  const params = await searchParams;
  const keyword = firstQueryValue(params?.keyword).trim();
  const stage = parseStage(firstQueryValue(params?.stage).trim());
  const quick = parseQuick(firstQueryValue(params?.quick).trim());
  const andFilters: Prisma.ProductWhereInput[] = [];

  if (keyword) {
    andFilters.push({
      OR: [
        { productName: { contains: keyword } },
        { specification: { contains: keyword } },
        { material: { contains: keyword } },
        { surfaceTreatment: { contains: keyword } },
        { order: { is: { orderNo: { contains: keyword } } } },
        { order: { is: { customer: { is: { name: { contains: keyword } } } } } },
        { parts: { some: { color: { contains: keyword } } } },
        { parts: { some: { partCode: { contains: keyword } } } },
        { parts: { some: { partName: { contains: keyword } } } }
      ]
    });
  }

  if (stage !== "all") {
    andFilters.push({ status: { in: stageStatusMap[stage] } });
  }

  const quickFilter = quickWhere(quick);
  if (quickFilter) {
    andFilters.push(quickFilter);
  }

  const where: Prisma.ProductWhereInput = andFilters.length > 0 ? { AND: andFilters } : {};

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

  return (
    <ProductionManager
      products={productionProducts}
      filters={{ keyword, stage, quick }}
      canPrintProduction={canPrintProduction}
      canUpdateProductionProgress={canUpdateProductionProgress}
      canReportProductionAbnormal={canReportProductionAbnormal}
    />
  );
}
