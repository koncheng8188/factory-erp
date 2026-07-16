import type { PrismaClient, ProductPart } from "@prisma/client";

export const PRISMA_INT_MAX = 2_147_483_647;

export class PositiveIntegerValidationError extends Error {
  constructor(fieldLabel: string) {
    super(`${fieldLabel}必须是 1 到 ${PRISMA_INT_MAX} 之间的正整数。`);
    this.name = "PositiveIntegerValidationError";
  }
}

export class ProductPartTotalQuantityValidationError extends Error {
  constructor() {
    super(`应加工数量不能超过 ${PRISMA_INT_MAX}。`);
    this.name = "ProductPartTotalQuantityValidationError";
  }
}

export class ProductPartPlanConflictError extends Error {
  constructor() {
    super("部件总数量不能小于已外发数量或已回/已完成数量。");
    this.name = "ProductPartPlanConflictError";
  }
}

export class ProductPartNotFoundError extends Error {
  constructor() {
    super("部件不存在。");
    this.name = "ProductPartNotFoundError";
  }
}

export type ProductPartPlanInput = {
  partName: string;
  partCode: string | null;
  specification: string | null;
  material: string | null;
  unitQuantity: unknown;
  productQuantity: unknown;
  surfaceTreatment: string | null;
  color: string | null;
  remark: string | null;
};

export function parseStrictPositiveInteger(value: unknown, fieldLabel: string) {
  let parsedValue: number;

  if (typeof value === "number") {
    parsedValue = value;
  } else if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    parsedValue = Number(value);
  } else {
    throw new PositiveIntegerValidationError(fieldLabel);
  }

  if (
    !Number.isInteger(parsedValue) ||
    !Number.isSafeInteger(parsedValue) ||
    parsedValue <= 0 ||
    parsedValue > PRISMA_INT_MAX
  ) {
    throw new PositiveIntegerValidationError(fieldLabel);
  }

  return parsedValue;
}

export function calculateProductPartTotalQuantity(unitQuantity: number, productQuantity: number) {
  const totalQuantity = unitQuantity * productQuantity;
  if (
    !Number.isInteger(totalQuantity) ||
    !Number.isSafeInteger(totalQuantity) ||
    totalQuantity <= 0 ||
    totalQuantity > PRISMA_INT_MAX
  ) {
    throw new ProductPartTotalQuantityValidationError();
  }

  return totalQuantity;
}

export async function updateProductPartPlan(
  client: PrismaClient,
  partId: string,
  input: ProductPartPlanInput
): Promise<ProductPart> {
  const unitQuantity = parseStrictPositiveInteger(input.unitQuantity, "单套用量");
  const productQuantity = parseStrictPositiveInteger(input.productQuantity, "产品数量");
  const totalQuantity = calculateProductPartTotalQuantity(unitQuantity, productQuantity);

  return client.$transaction(async (tx) => {
    const existingPart = await tx.productPart.findUnique({
      where: { id: partId },
      select: {
        id: true,
        outsourcedQuantity: true,
        returnedQuantity: true
      }
    });

    if (!existingPart) {
      throw new ProductPartNotFoundError();
    }

    if (
      totalQuantity < existingPart.outsourcedQuantity ||
      totalQuantity < existingPart.returnedQuantity
    ) {
      throw new ProductPartPlanConflictError();
    }

    return tx.productPart.update({
      where: { id: partId },
      data: {
        partName: input.partName,
        partCode: input.partCode,
        specification: input.specification,
        material: input.material,
        unitQuantity,
        productQuantity,
        totalQuantity,
        surfaceTreatment: input.surfaceTreatment,
        color: input.color,
        remark: input.remark
      }
    });
  });
}
