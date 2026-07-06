import ExcelJS from "exceljs";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseImportPartList } from "@/lib/import-part-list";
import { calculatePartTotalQuantity } from "@/lib/product-parts";

type ImportClient = PrismaClient | Prisma.TransactionClient;

export const ORDER_PRODUCT_IMPORT_SHEET_NAME = "订单产品部件";
export const ORDER_PRODUCT_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;

export const ORDER_PRODUCT_IMPORT_HEADERS = [
  "产品名称",
  "规格",
  "材质",
  "数量",
  "表面处理",
  "颜色",
  "产品备注",
  "部件清单"
] as const;

export type OrderProductImportRowInput = {
  rowNumber: number;
  productName: string;
  specification: string;
  material: string;
  quantity: string;
  surfaceTreatment: string;
  color: string;
  remark: string;
  partList: string;
};

export type OrderProductImportPart = {
  partName: string;
  partCode: string;
  unitQuantity: number;
  productQuantity: number;
  totalQuantity: number;
  specification: string;
  material: string;
  surfaceTreatment: string;
  color: string;
};

export type OrderProductImportProduct = {
  rowNumber: number;
  productIndex: number;
  productCode: string;
  productName: string;
  specification: string;
  material: string;
  quantity: number | null;
  surfaceTreatment: string;
  color: string;
  remark: string;
  partList: string;
  parts: OrderProductImportPart[];
  errors: string[];
  warnings: string[];
};

export type OrderProductImportPreview = {
  products: OrderProductImportProduct[];
  parts: Array<OrderProductImportPart & { rowNumber: number; productName: string; productCode: string }>;
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: Array<{ rowNumber: number; message: string }>;
  summary: {
    rowCount: number;
    productCount: number;
    partCount: number;
    errorCount: number;
    warningCount: number;
  };
  canConfirm: boolean;
};

export type OrderProductImportConfirmResult = {
  newProductCount: number;
  newPartCount: number;
};

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptional(value: string) {
  return value.trim() ? value.trim() : null;
}

function parsePositiveInteger(value: string) {
  if (!value.trim()) return null;
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : Number.NaN;
}

function formatCode(prefix: string, value: number) {
  return `${prefix}${String(value).padStart(3, "0")}`;
}

function getCellText(cell: ExcelJS.Cell) {
  const value = cell.value;

  if (value instanceof Date) {
    return cell.text.trim();
  }
  if (value && typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text).join("").trim();
  }
  if (value && typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim();
  }
  if (value && typeof value === "object" && "result" in value) {
    return String(value.result ?? "").trim();
  }

  return cell.text.trim();
}

function rowHasContent(values: string[]) {
  return values.some((value) => value.trim());
}

function setError(rowErrors: Map<number, string[]>, rowNumber: number, message: string) {
  const errors = rowErrors.get(rowNumber) ?? [];
  errors.push(message);
  rowErrors.set(rowNumber, errors);
}

function setWarning(rowWarnings: Map<number, string[]>, rowNumber: number, message: string) {
  const warnings = rowWarnings.get(rowNumber) ?? [];
  warnings.push(message);
  rowWarnings.set(rowNumber, warnings);
}

export const parsePartList = parseImportPartList;

export async function parseOrderProductWorkbook(buffer: Buffer): Promise<OrderProductImportRowInput[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Excel 文件没有可解析的工作表。");
  }

  const rows: OrderProductImportRowInput[] = [];
  worksheet.eachRow((worksheetRow, rowNumber) => {
    if (rowNumber === 1) return;

    const values = ORDER_PRODUCT_IMPORT_HEADERS.map((_, index) => getCellText(worksheetRow.getCell(index + 1)));
    if (!rowHasContent(values)) return;

    rows.push({
      rowNumber,
      productName: values[0],
      specification: values[1],
      material: values[2],
      quantity: values[3],
      surfaceTreatment: values[4],
      color: values[5],
      remark: values[6],
      partList: values[7]
    });
  });

  if (rows.length === 0) {
    throw new Error("Excel 文件没有可导入的数据行。");
  }

  return rows;
}

async function findOrder(orderId: string, client: ImportClient) {
  return client.order.findFirst({
    where: {
      OR: [{ id: orderId }, { orderNo: orderId }]
    },
    select: {
      id: true,
      orderNo: true,
      customerName: true
    }
  });
}

export async function validateOrderProductRows(
  orderId: string,
  inputRows: OrderProductImportRowInput[],
  client: ImportClient = prisma
): Promise<OrderProductImportPreview> {
  const order = await findOrder(orderId, client);
  if (!order) {
    throw new Error("当前订单不存在。");
  }

  const rowErrors = new Map<number, string[]>();
  const rowWarnings = new Map<number, string[]>();
  const products: OrderProductImportProduct[] = [];
  let productIndex = 0;

  for (const inputRow of inputRows) {
    const row: OrderProductImportRowInput = {
      rowNumber: inputRow.rowNumber,
      productName: trimText(inputRow.productName),
      specification: trimText(inputRow.specification),
      material: trimText(inputRow.material),
      quantity: trimText(inputRow.quantity),
      surfaceTreatment: trimText(inputRow.surfaceTreatment),
      color: trimText(inputRow.color),
      remark: trimText(inputRow.remark),
      partList: trimText(inputRow.partList)
    };

    productIndex += 1;
    const productCode = formatCode("P", productIndex);

    if (!row.productName) setError(rowErrors, row.rowNumber, "产品名称必填。");
    if (!row.quantity) setError(rowErrors, row.rowNumber, "数量必填。");
    if (!row.partList) setError(rowErrors, row.rowNumber, "部件清单不能为空，如整件产品请填写“整件*1”。");

    const parsedQuantity = parsePositiveInteger(row.quantity);
    if (row.quantity && Number.isNaN(parsedQuantity)) {
      setError(rowErrors, row.rowNumber, "数量必须是正整数。");
    }

    const productQuantity = typeof parsedQuantity === "number" && !Number.isNaN(parsedQuantity) ? parsedQuantity : null;
    const parts: OrderProductImportPart[] = [];
    const partNames = new Set<string>();
    const partCodes = new Set<string>();

    if (row.partList && productQuantity) {
      const parsedParts = parsePartList(row.partList);
      if (parsedParts.length === 0) {
        setError(rowErrors, row.rowNumber, "部件清单不能为空，如整件产品请填写“整件*1”。");
      }

      parsedParts.forEach((part, partIndex) => {
        const partCode = `${productCode}-${String(partIndex + 1).padStart(2, "0")}`;
        if (partCodes.has(partCode)) {
          setError(rowErrors, row.rowNumber, `自动生成的部件编号 ${partCode} 重复。`);
        }
        partCodes.add(partCode);

        if (!part.partName) {
          setError(rowErrors, row.rowNumber, `部件清单第 ${partIndex + 1} 项部件名称不能为空。`);
          return;
        }

        if (!Number.isInteger(part.unitQuantity) || part.unitQuantity <= 0) {
          setError(rowErrors, row.rowNumber, `部件“${part.partName}”单套用量必须是正整数。`);
          return;
        }

        const partNameKey = part.partName.trim();
        if (partNames.has(partNameKey)) {
          setError(rowErrors, row.rowNumber, `同一个产品里的部件名称“${part.partName}”重复。`);
        }
        partNames.add(partNameKey);

        const totalQuantity = calculatePartTotalQuantity(part.unitQuantity, productQuantity);
        if (totalQuantity !== part.unitQuantity * productQuantity) {
          setError(rowErrors, row.rowNumber, `部件“${part.partName}”应加工数量计算不正确。`);
        }

        parts.push({
          partName: part.partName,
          partCode,
          unitQuantity: part.unitQuantity,
          productQuantity,
          totalQuantity,
          specification: row.specification,
          material: row.material,
          surfaceTreatment: row.surfaceTreatment,
          color: row.color
        });
      });
    }

    if (row.partList && productQuantity && parts.length === 0 && !(rowErrors.get(row.rowNumber) ?? []).length) {
      setWarning(rowWarnings, row.rowNumber, "该产品没有解析到有效部件。");
    }

    products.push({
      rowNumber: row.rowNumber,
      productIndex,
      productCode,
      productName: row.productName,
      specification: row.specification,
      material: row.material,
      quantity: productQuantity,
      surfaceTreatment: row.surfaceTreatment,
      color: row.color,
      remark: row.remark,
      partList: row.partList,
      parts,
      errors: [],
      warnings: []
    });
  }

  for (const product of products) {
    product.errors = rowErrors.get(product.rowNumber) ?? [];
    product.warnings = rowWarnings.get(product.rowNumber) ?? [];
  }

  const errors = products.flatMap((product) => product.errors.map((message) => ({ rowNumber: product.rowNumber, message })));
  const warnings = products.flatMap((product) => product.warnings.map((message) => ({ rowNumber: product.rowNumber, message })));
  const parts = products.flatMap((product) =>
    product.parts.map((part) => ({
      ...part,
      rowNumber: product.rowNumber,
      productName: product.productName,
      productCode: product.productCode
    }))
  );

  return {
    products,
    parts,
    errors,
    warnings,
    summary: {
      rowCount: products.length,
      productCount: products.length,
      partCount: parts.length,
      errorCount: errors.length,
      warningCount: warnings.length
    },
    canConfirm: errors.length === 0
  };
}

export async function confirmOrderProductImport(
  orderId: string,
  inputRows: OrderProductImportRowInput[]
): Promise<OrderProductImportConfirmResult> {
  return prisma.$transaction(async (tx) => {
    const preview = await validateOrderProductRows(orderId, inputRows, tx);
    if (!preview.canConfirm) {
      const firstError = preview.errors[0];
      throw new Error(firstError ? `第 ${firstError.rowNumber} 行：${firstError.message}` : "导入数据校验失败。");
    }

    const order = await findOrder(orderId, tx);
    if (!order) {
      throw new Error("当前订单不存在。");
    }

    let newProductCount = 0;
    let newPartCount = 0;

    for (const productRow of preview.products) {
      if (!productRow.quantity) {
        throw new Error(`第 ${productRow.rowNumber} 行：产品数量无效。`);
      }

      const product = await tx.product.create({
        data: {
          orderId: order.id,
          productName: productRow.productName,
          specification: normalizeOptional(productRow.specification),
          material: normalizeOptional(productRow.material),
          quantity: productRow.quantity,
          surfaceTreatment: normalizeOptional(productRow.surfaceTreatment),
          status: "PENDING",
          remark: normalizeOptional(productRow.remark)
        }
      });
      newProductCount += 1;

      for (const part of productRow.parts) {
        await tx.productPart.create({
          data: {
            orderId: order.id,
            productId: product.id,
            partName: part.partName,
            partCode: part.partCode,
            specification: normalizeOptional(part.specification),
            material: normalizeOptional(part.material),
            unitQuantity: part.unitQuantity,
            productQuantity: part.productQuantity,
            totalQuantity: part.totalQuantity,
            surfaceTreatment: normalizeOptional(part.surfaceTreatment),
            color: normalizeOptional(part.color),
            outsourcedQuantity: 0,
            returnedQuantity: 0,
            missingQuantity: 0,
            status: "PENDING",
            remark: null
          }
        });
        newPartCount += 1;
      }
    }

    return { newProductCount, newPartCount };
  });
}
