import ExcelJS from "exceljs";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseImportPartList } from "@/lib/import-part-list";
import { generateOrderNo } from "@/lib/orders";
import { calculatePartTotalQuantity } from "@/lib/product-parts";

type ImportClient = PrismaClient | Prisma.TransactionClient;

export const SIMPLE_IMPORT_SHEET_NAME = "全局简易导入";
export const SIMPLE_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;

export const SIMPLE_IMPORT_HEADERS = [
  "订单分组",
  "客户名称",
  "联系人",
  "电话",
  "地址",
  "客户备注",
  "订单号",
  "下单日期",
  "交货日期",
  "订单备注",
  "产品名称",
  "产品规格",
  "产品材质",
  "产品数量",
  "产品表面处理",
  "颜色",
  "产品备注",
  "部件清单"
] as const;

type DateParseResult = {
  value: Date | null;
  text: string;
  error: string | null;
};

export type SimpleImportRowInput = {
  rowNumber: number;
  orderGroup: string;
  customerName: string;
  contact: string;
  phone: string;
  address: string;
  customerRemark: string;
  orderNo: string;
  orderDate: string;
  deliveryDate: string;
  orderRemark: string;
  productName: string;
  productSpecification: string;
  productMaterial: string;
  productQuantity: string;
  productSurfaceTreatment: string;
  color: string;
  productRemark: string;
  partList: string;
};

export type SimpleImportPartPreview = {
  rowNumber: number;
  orderKey: string;
  productCode: string;
  productName: string;
  partName: string;
  partCode: string;
  unitQuantity: number;
  productQuantity: number;
  totalQuantity: number;
};

export type SimpleImportProductPreview = SimpleImportRowInput & {
  orderKey: string;
  inheritedOrderInfo: boolean;
  productCode: string;
  parsedProductQuantity: number | null;
  parts: SimpleImportPartPreview[];
  errors: string[];
  warnings: string[];
};

export type SimpleImportOrderPreview = {
  orderKey: string;
  orderGroup: string;
  customerName: string;
  orderNo: string;
  orderDate: string;
  deliveryDate: string;
  inheritedRowCount: number;
  productCount: number;
  partCount: number;
};

export type SimpleImportSummary = {
  rowCount: number;
  orderCount: number;
  productCount: number;
  partCount: number;
  newCustomerCount: number;
  reusedCustomerCount: number;
  errorCount: number;
  warningCount: number;
};

export type SimpleImportPreviewResult = {
  orders: SimpleImportOrderPreview[];
  products: SimpleImportProductPreview[];
  parts: SimpleImportPartPreview[];
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: Array<{ rowNumber: number; message: string }>;
  summary: SimpleImportSummary;
  canConfirm: boolean;
};

export type SimpleImportConfirmResult = {
  newCustomerCount: number;
  reusedCustomerCount: number;
  newOrderCount: number;
  newProductCount: number;
  newPartCount: number;
};

type OrderContext = Pick<
  SimpleImportRowInput,
  "orderGroup" | "customerName" | "contact" | "phone" | "address" | "customerRemark" | "orderNo" | "orderDate" | "deliveryDate" | "orderRemark"
> & {
  orderKey: string;
};

const MIN_VALID_YEAR = 2000;
const MAX_VALID_YEAR = 2100;
const excelSerialDateBase = Date.UTC(1899, 11, 30);

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: string) {
  return value.trim();
}

function normalizeOptional(value: string) {
  return value.trim() ? value.trim() : null;
}

function parsePositiveInteger(value: string) {
  if (!value.trim()) return null;
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : Number.NaN;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function invalidDateMessage() {
  return "格式不正确，请使用 2026-07-05 或 Excel 日期格式";
}

function isValidDateYear(date: Date) {
  const year = date.getFullYear();
  return year >= MIN_VALID_YEAR && year <= MAX_VALID_YEAR;
}

function excelSerialToDate(serial: number) {
  if (!Number.isFinite(serial) || serial <= 0) return null;

  const wholeDays = Math.floor(serial);
  return new Date(excelSerialDateBase + wholeDays * 24 * 60 * 60 * 1000);
}

function parseDateValue(value: string, fallback?: Date): DateParseResult {
  if (!value.trim()) {
    const nextDate = fallback ?? null;
    return { value: nextDate, text: nextDate ? formatDateInput(nextDate) : "", error: null };
  }

  const trimmed = value.trim();
  const serialNumber = Number(trimmed);
  const date = /^-?\d+(\.\d+)?$/.test(trimmed)
    ? excelSerialToDate(serialNumber)
    : (() => {
      const normalized = trimmed.replace(/[/.]/g, "-");
      const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!match) return null;

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const parsed = new Date(year, month - 1, day);

      if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
        return null;
      }

      return parsed;
    })();

  if (!date || Number.isNaN(date.getTime()) || !isValidDateYear(date)) {
    return { value: null, text: trimmed, error: invalidDateMessage() };
  }

  return { value: date, text: formatDateInput(date), error: null };
}

function getCellText(cell: ExcelJS.Cell) {
  const value = cell.value;

  if (value instanceof Date) {
    return formatDateInput(value);
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

function sameValue(a: string, b: string) {
  return a.trim() === b.trim();
}

function addConsistencyError(rowErrors: Map<number, string[]>, rowNumber: number, fieldLabel: string, firstRowNumber: number) {
  setError(rowErrors, rowNumber, `${fieldLabel}与第 ${firstRowNumber} 行不一致。`);
}

function createImplicitOrderKey(index: number) {
  return `__AUTO_ORDER_${String(index).padStart(3, "0")}`;
}

function resolveOrderKey(row: SimpleImportRowInput, lastOrderContext: OrderContext | null, implicitOrderIndex: number) {
  if (row.orderGroup) return { orderKey: row.orderGroup, nextImplicitOrderIndex: implicitOrderIndex };
  if (row.orderNo) return { orderKey: `ORDERNO:${row.orderNo}`, nextImplicitOrderIndex: implicitOrderIndex };
  if (row.customerName) {
    const nextIndex = implicitOrderIndex + 1;
    return { orderKey: createImplicitOrderKey(nextIndex), nextImplicitOrderIndex: nextIndex };
  }
  return { orderKey: lastOrderContext?.orderKey ?? "", nextImplicitOrderIndex: implicitOrderIndex };
}

async function loadExistingCustomers(client: ImportClient, customerNames: string[]) {
  if (customerNames.length === 0) return new Map<string, string>();

  const customers = await client.customer.findMany({
    where: { name: { in: customerNames } },
    select: { id: true, name: true }
  });
  const map = new Map<string, string>();
  for (const customer of customers) {
    map.set(normalizeKey(customer.name), customer.id);
  }
  return map;
}

async function loadExistingOrderNos(client: ImportClient, orderNos: string[]) {
  if (orderNos.length === 0) return new Set<string>();

  const orders = await client.order.findMany({
    where: { orderNo: { in: orderNos } },
    select: { orderNo: true }
  });
  return new Set(orders.map((order) => order.orderNo));
}

export async function parseSimpleImportWorkbook(buffer: Buffer): Promise<SimpleImportRowInput[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Excel 文件没有可解析的工作表。");
  }

  const rows: SimpleImportRowInput[] = [];
  worksheet.eachRow((worksheetRow, rowNumber) => {
    if (rowNumber === 1) return;

    const values = SIMPLE_IMPORT_HEADERS.map((_, index) => getCellText(worksheetRow.getCell(index + 1)));
    if (!rowHasContent(values)) return;

    rows.push({
      rowNumber,
      orderGroup: values[0],
      customerName: values[1],
      contact: values[2],
      phone: values[3],
      address: values[4],
      customerRemark: values[5],
      orderNo: values[6],
      orderDate: values[7],
      deliveryDate: values[8],
      orderRemark: values[9],
      productName: values[10],
      productSpecification: values[11],
      productMaterial: values[12],
      productQuantity: values[13],
      productSurfaceTreatment: values[14],
      color: values[15],
      productRemark: values[16],
      partList: values[17]
    });
  });

  if (rows.length === 0) {
    throw new Error("Excel 文件没有可导入的数据行。");
  }

  return rows;
}

export async function validateSimpleImportRows(
  inputRows: SimpleImportRowInput[],
  client: ImportClient = prisma
): Promise<SimpleImportPreviewResult> {
  const today = new Date();
  const rowErrors = new Map<number, string[]>();
  const rowWarnings = new Map<number, string[]>();
  const normalizedProducts: SimpleImportProductPreview[] = [];
  const orderContextByKey = new Map<string, OrderContext & { firstRowNumber: number }>();
  const orderNoToKey = new Map<string, string>();
  const orderKeyToNos = new Map<string, Set<string>>();
  const customerNames = new Set<string>();
  const explicitOrderNos = new Set<string>();
  const inheritedRowByRowNumber = new Map<number, boolean>();
  const productIndexByOrderKey = new Map<string, number>();
  let lastOrderContext: OrderContext | null = null;
  let implicitOrderIndex = 0;

  for (const inputRow of inputRows) {
    const rawRow: SimpleImportRowInput = {
      rowNumber: inputRow.rowNumber,
      orderGroup: trimText(inputRow.orderGroup),
      customerName: trimText(inputRow.customerName),
      contact: trimText(inputRow.contact),
      phone: trimText(inputRow.phone),
      address: trimText(inputRow.address),
      customerRemark: trimText(inputRow.customerRemark),
      orderNo: trimText(inputRow.orderNo),
      orderDate: trimText(inputRow.orderDate),
      deliveryDate: trimText(inputRow.deliveryDate),
      orderRemark: trimText(inputRow.orderRemark),
      productName: trimText(inputRow.productName),
      productSpecification: trimText(inputRow.productSpecification),
      productMaterial: trimText(inputRow.productMaterial),
      productQuantity: trimText(inputRow.productQuantity),
      productSurfaceTreatment: trimText(inputRow.productSurfaceTreatment),
      color: trimText(inputRow.color),
      productRemark: trimText(inputRow.productRemark),
      partList: trimText(inputRow.partList)
    };

    const hasAnyOrderInfo = Boolean(
      rawRow.orderGroup || rawRow.customerName || rawRow.contact || rawRow.phone || rawRow.address || rawRow.customerRemark ||
      rawRow.orderNo || rawRow.orderDate || rawRow.deliveryDate || rawRow.orderRemark
    );
    const inheritedOrderInfo = !hasAnyOrderInfo && Boolean(lastOrderContext);
    const keyResult = resolveOrderKey(rawRow, lastOrderContext, implicitOrderIndex);
    implicitOrderIndex = keyResult.nextImplicitOrderIndex;
    const canInheritOrderFields = Boolean(lastOrderContext) && (!hasAnyOrderInfo || keyResult.orderKey === lastOrderContext?.orderKey);
    const contextToInherit = orderContextByKey.get(keyResult.orderKey) ?? (canInheritOrderFields ? lastOrderContext : null);

    const row: SimpleImportRowInput & { orderKey: string } = {
      ...rawRow,
      orderGroup: rawRow.orderGroup || contextToInherit?.orderGroup || "",
      customerName: rawRow.customerName || contextToInherit?.customerName || "",
      contact: rawRow.contact || contextToInherit?.contact || "",
      phone: rawRow.phone || contextToInherit?.phone || "",
      address: rawRow.address || contextToInherit?.address || "",
      customerRemark: rawRow.customerRemark || contextToInherit?.customerRemark || "",
      orderNo: rawRow.orderNo || contextToInherit?.orderNo || "",
      orderDate: rawRow.orderDate || contextToInherit?.orderDate || "",
      deliveryDate: rawRow.deliveryDate || contextToInherit?.deliveryDate || "",
      orderRemark: rawRow.orderRemark || contextToInherit?.orderRemark || "",
      orderKey: keyResult.orderKey
    };

    if (!row.orderKey) {
      setError(rowErrors, row.rowNumber, "第一条有效数据缺少客户名称，无法继承订单信息。");
    }

    const orderContext: OrderContext = {
      orderKey: row.orderKey,
      orderGroup: row.orderGroup,
      customerName: row.customerName,
      contact: row.contact,
      phone: row.phone,
      address: row.address,
      customerRemark: row.customerRemark,
      orderNo: row.orderNo,
      orderDate: row.orderDate,
      deliveryDate: row.deliveryDate,
      orderRemark: row.orderRemark
    };

    if (row.orderKey) {
      const existingContext = orderContextByKey.get(row.orderKey);
      if (!existingContext) {
        orderContextByKey.set(row.orderKey, { ...orderContext, firstRowNumber: row.rowNumber });
      } else {
        if (!sameValue(row.customerName, existingContext.customerName)) addConsistencyError(rowErrors, row.rowNumber, "同一订单的客户名称", existingContext.firstRowNumber);
        if (!sameValue(row.contact, existingContext.contact)) addConsistencyError(rowErrors, row.rowNumber, "同一订单的联系人", existingContext.firstRowNumber);
        if (!sameValue(row.phone, existingContext.phone)) addConsistencyError(rowErrors, row.rowNumber, "同一订单的电话", existingContext.firstRowNumber);
        if (!sameValue(row.address, existingContext.address)) addConsistencyError(rowErrors, row.rowNumber, "同一订单的地址", existingContext.firstRowNumber);
        if (!sameValue(row.customerRemark, existingContext.customerRemark)) addConsistencyError(rowErrors, row.rowNumber, "同一订单的客户备注", existingContext.firstRowNumber);
        if (!sameValue(row.orderDate, existingContext.orderDate)) addConsistencyError(rowErrors, row.rowNumber, "同一订单的下单日期", existingContext.firstRowNumber);
        if (!sameValue(row.deliveryDate, existingContext.deliveryDate)) addConsistencyError(rowErrors, row.rowNumber, "同一订单的交货日期", existingContext.firstRowNumber);
        if (!sameValue(row.orderRemark, existingContext.orderRemark)) addConsistencyError(rowErrors, row.rowNumber, "同一订单的订单备注", existingContext.firstRowNumber);
      }
    }

    if (!row.customerName) setError(rowErrors, row.rowNumber, "客户名称必填。");
    if (!row.productName) setError(rowErrors, row.rowNumber, "产品名称必填。");
    if (!row.productQuantity) setError(rowErrors, row.rowNumber, "产品数量必填。");
    if (!row.partList) setError(rowErrors, row.rowNumber, "部件清单不能为空，如整件产品请填写“整件*1”。");

    const parsedProductQuantity = parsePositiveInteger(row.productQuantity);
    if (row.productQuantity && Number.isNaN(parsedProductQuantity)) {
      setError(rowErrors, row.rowNumber, "产品数量必须是正整数。");
    }
    const productQuantity = typeof parsedProductQuantity === "number" && !Number.isNaN(parsedProductQuantity) ? parsedProductQuantity : null;

    const orderDate = parseDateValue(row.orderDate, today);
    if (orderDate.error) setError(rowErrors, row.rowNumber, `下单日期${orderDate.error}。`);
    row.orderDate = orderDate.text;

    const deliveryDate = parseDateValue(row.deliveryDate);
    if (deliveryDate.error) setError(rowErrors, row.rowNumber, `交货日期${deliveryDate.error}。`);
    row.deliveryDate = deliveryDate.text;

    if (row.customerName) customerNames.add(normalizeKey(row.customerName));
    if (row.orderNo) {
      explicitOrderNos.add(row.orderNo);
      const keyNos = orderKeyToNos.get(row.orderKey) ?? new Set<string>();
      keyNos.add(row.orderNo);
      orderKeyToNos.set(row.orderKey, keyNos);
      if (keyNos.size > 1) {
        setError(rowErrors, row.rowNumber, "同一订单内填写的订单号必须一致。");
      }

      const existingOrderKey = orderNoToKey.get(row.orderNo);
      if (existingOrderKey && existingOrderKey !== row.orderKey) {
        setError(rowErrors, row.rowNumber, `订单号 ${row.orderNo} 已被 Excel 内其他订单使用。`);
      } else {
        orderNoToKey.set(row.orderNo, row.orderKey);
      }
    }

    const nextProductIndex = (productIndexByOrderKey.get(row.orderKey) ?? 0) + 1;
    productIndexByOrderKey.set(row.orderKey, nextProductIndex);
    const productCode = `P${String(nextProductIndex).padStart(3, "0")}`;
    const parts: SimpleImportPartPreview[] = [];
    const partNames = new Set<string>();
    const partCodes = new Set<string>();

    if (row.partList && productQuantity) {
      const parsedParts = parseImportPartList(row.partList);
      if (parsedParts.length === 0) {
        setError(rowErrors, row.rowNumber, "部件清单不能为空，如整件产品请填写“整件*1”。");
      }

      parsedParts.forEach((part, partIndex) => {
        const partCode = `${productCode}-${String(partIndex + 1).padStart(2, "0")}`;
        if (partCodes.has(partCode)) {
          setError(rowErrors, row.rowNumber, `自动生成的部件编号 ${partCode} 重复。`);
        }
        partCodes.add(partCode);

        if (part.error) {
          setError(rowErrors, row.rowNumber, part.error);
          return;
        }

        const partNameKey = part.partName.trim();
        if (partNames.has(partNameKey)) {
          setError(rowErrors, row.rowNumber, `同一个产品里的部件名称“${part.partName}”重复。`);
        }
        partNames.add(partNameKey);

        const totalQuantity = calculatePartTotalQuantity(part.unitQuantity, productQuantity);
        parts.push({
          rowNumber: row.rowNumber,
          orderKey: row.orderKey,
          productCode,
          productName: row.productName,
          partName: part.partName,
          partCode,
          unitQuantity: part.unitQuantity,
          productQuantity,
          totalQuantity
        });
      });
    }

    normalizedProducts.push({
      ...row,
      inheritedOrderInfo,
      productCode,
      parsedProductQuantity: productQuantity,
      parts,
      errors: [],
      warnings: []
    });
    inheritedRowByRowNumber.set(row.rowNumber, inheritedOrderInfo);
    lastOrderContext = orderContext;
  }

  const existingOrderNos = await loadExistingOrderNos(client, Array.from(explicitOrderNos));
  for (const row of normalizedProducts) {
    if (row.orderNo && existingOrderNos.has(row.orderNo)) {
      setError(rowErrors, row.rowNumber, `订单号 ${row.orderNo} 已存在，不能重复导入。`);
    }
  }

  const existingCustomers = await loadExistingCustomers(client, Array.from(customerNames));
  for (const row of normalizedProducts) {
    row.errors = rowErrors.get(row.rowNumber) ?? [];
    row.warnings = rowWarnings.get(row.rowNumber) ?? [];
    if (row.customerName && existingCustomers.has(normalizeKey(row.customerName))) {
      row.warnings.push(`客户“${row.customerName}”已存在，将复用已有客户资料。`);
    }
  }

  const errors = normalizedProducts.flatMap((row) => row.errors.map((message) => ({ rowNumber: row.rowNumber, message })));
  const warnings = normalizedProducts.flatMap((row) => row.warnings.map((message) => ({ rowNumber: row.rowNumber, message })));
  const parts = normalizedProducts.flatMap((row) => row.parts);
  const orderKeys = Array.from(new Set(normalizedProducts.map((row) => row.orderKey).filter(Boolean)));
  const orders = orderKeys.map((orderKey) => {
    const rows = normalizedProducts.filter((row) => row.orderKey === orderKey);
    const firstRow = rows[0];
    return {
      orderKey,
      orderGroup: firstRow?.orderGroup ?? "",
      customerName: firstRow?.customerName ?? "",
      orderNo: firstRow?.orderNo || "系统自动生成",
      orderDate: firstRow?.orderDate ?? "",
      deliveryDate: firstRow?.deliveryDate ?? "",
      inheritedRowCount: rows.filter((row) => inheritedRowByRowNumber.get(row.rowNumber)).length,
      productCount: rows.length,
      partCount: rows.reduce((sum, row) => sum + row.parts.length, 0)
    };
  });

  const reusedCustomerNames = Array.from(customerNames).filter((name) => existingCustomers.has(name));
  const newCustomerNames = Array.from(customerNames).filter((name) => !existingCustomers.has(name));

  return {
    orders,
    products: normalizedProducts,
    parts,
    errors,
    warnings,
    summary: {
      rowCount: normalizedProducts.length,
      orderCount: orders.length,
      productCount: normalizedProducts.length,
      partCount: parts.length,
      newCustomerCount: newCustomerNames.length,
      reusedCustomerCount: reusedCustomerNames.length,
      errorCount: errors.length,
      warningCount: warnings.length
    },
    canConfirm: errors.length === 0
  };
}

function toDate(value: string) {
  const parsed = parseDateValue(value);
  if (!parsed.value) {
    throw new Error(`日期 ${value} 无法解析。`);
  }
  return parsed.value;
}

export async function confirmSimpleImportRows(inputRows: SimpleImportRowInput[]): Promise<SimpleImportConfirmResult> {
  return prisma.$transaction(async (tx) => {
    const preview = await validateSimpleImportRows(inputRows, tx);
    if (!preview.canConfirm) {
      const firstError = preview.errors[0];
      throw new Error(firstError ? `第 ${firstError.rowNumber} 行：${firstError.message}` : "导入数据校验失败。");
    }

    const rows = preview.products;
    const customerByName = new Map<string, string>();
    const customerNames = Array.from(new Set(rows.map((row) => normalizeKey(row.customerName)).filter(Boolean)));
    const existingCustomers = await tx.customer.findMany({
      where: { name: { in: customerNames } },
      select: { id: true, name: true }
    });
    for (const customer of existingCustomers) {
      customerByName.set(normalizeKey(customer.name), customer.id);
    }

    const createdCustomerNames = new Set<string>();
    const reusedCustomerNames = new Set<string>();
    const reservedOrderNos = new Set<string>();
    let newOrderCount = 0;
    let newProductCount = 0;
    let newPartCount = 0;

    for (const orderPreview of preview.orders) {
      const orderRows = rows.filter((row) => row.orderKey === orderPreview.orderKey);
      const firstRow = orderRows[0];
      if (!firstRow) continue;

      const customerKey = normalizeKey(firstRow.customerName);
      let customerId = customerByName.get(customerKey);
      if (customerId) {
        reusedCustomerNames.add(customerKey);
      } else {
        const customer = await tx.customer.create({
          data: {
            name: firstRow.customerName,
            contact: normalizeOptional(firstRow.contact),
            phone: normalizeOptional(firstRow.phone),
            address: normalizeOptional(firstRow.address),
            remark: normalizeOptional(firstRow.customerRemark)
          }
        });
        customerId = customer.id;
        customerByName.set(customerKey, customer.id);
        createdCustomerNames.add(customerKey);
      }

      const orderDate = toDate(firstRow.orderDate);
      const deliveryDate = firstRow.deliveryDate ? toDate(firstRow.deliveryDate) : null;
      const orderNo = firstRow.orderNo || await generateOrderNo(orderDate, tx, reservedOrderNos);
      if (firstRow.orderNo && reservedOrderNos.has(orderNo)) {
        throw new Error(`订单号 ${orderNo} 与本次导入内已生成或已使用的订单号重复。`);
      }
      if (firstRow.orderNo) reservedOrderNos.add(orderNo);

      const order = await tx.order.create({
        data: {
          orderNo,
          customerId,
          customerName: firstRow.customerName,
          orderDate,
          deliveryDate,
          status: "PENDING",
          remark: normalizeOptional(firstRow.orderRemark)
        }
      });
      newOrderCount += 1;

      for (const productRow of orderRows) {
        if (!productRow.parsedProductQuantity) {
          throw new Error(`第 ${productRow.rowNumber} 行：产品数量无效。`);
        }

        const product = await tx.product.create({
          data: {
            orderId: order.id,
            productName: productRow.productName,
            specification: normalizeOptional(productRow.productSpecification),
            material: normalizeOptional(productRow.productMaterial),
            quantity: productRow.parsedProductQuantity,
            surfaceTreatment: normalizeOptional(productRow.productSurfaceTreatment),
            status: "PENDING",
            remark: normalizeOptional(productRow.productRemark)
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
              specification: normalizeOptional(productRow.productSpecification),
              material: normalizeOptional(productRow.productMaterial),
              unitQuantity: part.unitQuantity,
              productQuantity: part.productQuantity,
              totalQuantity: part.totalQuantity,
              surfaceTreatment: normalizeOptional(productRow.productSurfaceTreatment),
              color: normalizeOptional(productRow.color),
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
    }

    return {
      newCustomerCount: createdCustomerNames.size,
      reusedCustomerCount: reusedCustomerNames.size,
      newOrderCount,
      newProductCount,
      newPartCount
    };
  });
}
