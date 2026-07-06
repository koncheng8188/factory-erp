import ExcelJS from "exceljs";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateOrderNo } from "@/lib/orders";
import { calculatePartTotalQuantity } from "@/lib/product-parts";

export const IMPORT_SHEET_NAME = "订单产品部件";
export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

export const IMPORT_HEADERS = [
  "订单分组",
  "产品分组",
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
  "产品备注",
  "部件名称",
  "部件编号",
  "部件规格",
  "部件材质",
  "单套用量",
  "部件产品数量",
  "部件表面处理",
  "颜色",
  "部件备注"
] as const;

type ImportClient = PrismaClient | Prisma.TransactionClient;

export type ImportRowInput = {
  rowNumber: number;
  orderGroup: string;
  productGroup: string;
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
  productRemark: string;
  partName: string;
  partCode: string;
  partSpecification: string;
  partMaterial: string;
  unitQuantity: string;
  partProductQuantity: string;
  partSurfaceTreatment: string;
  color: string;
  partRemark: string;
};

export type ImportPreviewRow = ImportRowInput & {
  parsedProductQuantity: number | null;
  parsedUnitQuantity: number | null;
  parsedPartProductQuantity: number | null;
  totalQuantity: number | null;
  errors: string[];
  warnings: string[];
};

export type ImportSummary = {
  rowCount: number;
  orderCount: number;
  productCount: number;
  partCount: number;
  newCustomerCount: number;
  reusedCustomerCount: number;
  errorCount: number;
  warningCount: number;
};

export type ImportPreviewResult = {
  rows: ImportPreviewRow[];
  groups: Array<{
    orderGroup: string;
    customerName: string;
    orderNo: string;
    productCount: number;
    partCount: number;
  }>;
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: Array<{ rowNumber: number; message: string }>;
  summary: ImportSummary;
  canConfirm: boolean;
};

export type ImportConfirmResult = {
  newCustomerCount: number;
  reusedCustomerCount: number;
  newOrderCount: number;
  newProductCount: number;
  newPartCount: number;
};

type DateParseResult = {
  value: Date | null;
  text: string;
  error: string | null;
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

export function createEmptyImportRow(rowNumber: number): ImportRowInput {
  return {
    rowNumber,
    orderGroup: "",
    productGroup: "",
    customerName: "",
    contact: "",
    phone: "",
    address: "",
    customerRemark: "",
    orderNo: "",
    orderDate: "",
    deliveryDate: "",
    orderRemark: "",
    productName: "",
    productSpecification: "",
    productMaterial: "",
    productQuantity: "",
    productSurfaceTreatment: "",
    productRemark: "",
    partName: "",
    partCode: "",
    partSpecification: "",
    partMaterial: "",
    unitQuantity: "",
    partProductQuantity: "",
    partSurfaceTreatment: "",
    color: "",
    partRemark: ""
  };
}

export async function parseImportWorkbook(buffer: Buffer): Promise<ImportRowInput[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);

  const worksheet = workbook.getWorksheet(IMPORT_SHEET_NAME) ?? workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Excel 文件没有可解析的工作表。");
  }

  const rows: ImportRowInput[] = [];
  worksheet.eachRow((worksheetRow, rowNumber) => {
    if (rowNumber === 1) return;

    const values = IMPORT_HEADERS.map((_, index) => getCellText(worksheetRow.getCell(index + 1)));
    if (!rowHasContent(values)) return;

    rows.push({
      rowNumber,
      orderGroup: values[0],
      productGroup: values[1],
      customerName: values[2],
      contact: values[3],
      phone: values[4],
      address: values[5],
      customerRemark: values[6],
      orderNo: values[7],
      orderDate: values[8],
      deliveryDate: values[9],
      orderRemark: values[10],
      productName: values[11],
      productSpecification: values[12],
      productMaterial: values[13],
      productQuantity: values[14],
      productSurfaceTreatment: values[15],
      productRemark: values[16],
      partName: values[17],
      partCode: values[18],
      partSpecification: values[19],
      partMaterial: values[20],
      unitQuantity: values[21],
      partProductQuantity: values[22],
      partSurfaceTreatment: values[23],
      color: values[24],
      partRemark: values[25]
    });
  });

  if (rows.length === 0) {
    throw new Error("Excel 文件没有可导入的数据行。");
  }

  return rows;
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

function addConsistencyError(
  rowErrors: Map<number, string[]>,
  rowNumber: number,
  fieldLabel: string,
  firstRowNumber: number
) {
  setError(rowErrors, rowNumber, `${fieldLabel}与第 ${firstRowNumber} 行不一致。`);
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

export async function validateImportRows(
  inputRows: ImportRowInput[],
  client: ImportClient = prisma
): Promise<ImportPreviewResult> {
  const today = new Date();
  const rowErrors = new Map<number, string[]>();
  const rowWarnings = new Map<number, string[]>();
  const orderGroups = new Map<string, ImportRowInput & { firstRowNumber: number }>();
  const productGroups = new Map<string, ImportRowInput & { firstRowNumber: number }>();
  const orderNoToGroup = new Map<string, string>();
  const orderGroupToNos = new Map<string, Set<string>>();
  const customerNames = new Set<string>();
  const explicitOrderNos = new Set<string>();
  const productPartCodes = new Map<string, Set<string>>();
  const productPartNamesWithoutCode = new Map<string, Set<string>>();
  const normalizedRows: ImportPreviewRow[] = [];

  for (const inputRow of inputRows) {
    const row = {
      ...createEmptyImportRow(inputRow.rowNumber),
      ...inputRow,
      orderGroup: trimText(inputRow.orderGroup),
      productGroup: trimText(inputRow.productGroup),
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
      productRemark: trimText(inputRow.productRemark),
      partName: trimText(inputRow.partName),
      partCode: trimText(inputRow.partCode),
      partSpecification: trimText(inputRow.partSpecification),
      partMaterial: trimText(inputRow.partMaterial),
      unitQuantity: trimText(inputRow.unitQuantity),
      partProductQuantity: trimText(inputRow.partProductQuantity),
      partSurfaceTreatment: trimText(inputRow.partSurfaceTreatment),
      color: trimText(inputRow.color),
      partRemark: trimText(inputRow.partRemark)
    };

    if (!row.orderGroup) setError(rowErrors, row.rowNumber, "订单分组必填。");
    if (!row.productGroup) setError(rowErrors, row.rowNumber, "产品分组必填。");
    if (!row.customerName) setError(rowErrors, row.rowNumber, "客户名称必填。");
    if (!row.productName) setError(rowErrors, row.rowNumber, "产品名称必填。");
    if (!row.productQuantity) setError(rowErrors, row.rowNumber, "产品数量必填。");

    const parsedProductQuantity = parsePositiveInteger(row.productQuantity);
    if (row.productQuantity && Number.isNaN(parsedProductQuantity)) {
      setError(rowErrors, row.rowNumber, "产品数量必须是正整数。");
    }

    let parsedUnitQuantity: number | null = null;
    if (row.partName) {
      if (!row.unitQuantity) {
        setError(rowErrors, row.rowNumber, "填写部件名称时，单套用量必填。");
      }
      parsedUnitQuantity = parsePositiveInteger(row.unitQuantity);
      if (row.unitQuantity && Number.isNaN(parsedUnitQuantity)) {
        setError(rowErrors, row.rowNumber, "单套用量必须是正整数。");
      }
    }

    let parsedPartProductQuantity: number | null = null;
    if (row.partProductQuantity) {
      parsedPartProductQuantity = parsePositiveInteger(row.partProductQuantity);
      if (Number.isNaN(parsedPartProductQuantity)) {
        setError(rowErrors, row.rowNumber, "部件产品数量必须是正整数。");
      }
    } else if (typeof parsedProductQuantity === "number" && !Number.isNaN(parsedProductQuantity)) {
      parsedPartProductQuantity = parsedProductQuantity;
      row.partProductQuantity = String(parsedProductQuantity);
    }

    const orderDate = parseDateValue(row.orderDate, today);
    if (orderDate.error) setError(rowErrors, row.rowNumber, `下单日期${orderDate.error}。`);
    row.orderDate = orderDate.text;

    const deliveryDate = parseDateValue(row.deliveryDate);
    if (deliveryDate.error) setError(rowErrors, row.rowNumber, `交货日期${deliveryDate.error}。`);
    row.deliveryDate = deliveryDate.text;

    if (row.customerName) customerNames.add(normalizeKey(row.customerName));
    if (row.orderNo) explicitOrderNos.add(row.orderNo);

    if (row.orderGroup) {
      const orderGroup = orderGroups.get(row.orderGroup);
      if (!orderGroup) {
        orderGroups.set(row.orderGroup, { ...row, firstRowNumber: row.rowNumber });
      } else {
        if (!sameValue(row.customerName, orderGroup.customerName)) addConsistencyError(rowErrors, row.rowNumber, "同一订单分组的客户名称", orderGroup.firstRowNumber);
        if (!sameValue(row.contact, orderGroup.contact)) addConsistencyError(rowErrors, row.rowNumber, "同一订单分组的联系人", orderGroup.firstRowNumber);
        if (!sameValue(row.phone, orderGroup.phone)) addConsistencyError(rowErrors, row.rowNumber, "同一订单分组的电话", orderGroup.firstRowNumber);
        if (!sameValue(row.address, orderGroup.address)) addConsistencyError(rowErrors, row.rowNumber, "同一订单分组的地址", orderGroup.firstRowNumber);
        if (!sameValue(row.customerRemark, orderGroup.customerRemark)) addConsistencyError(rowErrors, row.rowNumber, "同一订单分组的客户备注", orderGroup.firstRowNumber);
        if (!sameValue(row.orderDate, orderGroup.orderDate)) addConsistencyError(rowErrors, row.rowNumber, "同一订单分组的下单日期", orderGroup.firstRowNumber);
        if (!sameValue(row.deliveryDate, orderGroup.deliveryDate)) addConsistencyError(rowErrors, row.rowNumber, "同一订单分组的交货日期", orderGroup.firstRowNumber);
        if (!sameValue(row.orderRemark, orderGroup.orderRemark)) addConsistencyError(rowErrors, row.rowNumber, "同一订单分组的订单备注", orderGroup.firstRowNumber);
      }

      if (row.orderNo) {
        const groupNos = orderGroupToNos.get(row.orderGroup) ?? new Set<string>();
        groupNos.add(row.orderNo);
        orderGroupToNos.set(row.orderGroup, groupNos);
        if (groupNos.size > 1) {
          setError(rowErrors, row.rowNumber, "同一订单分组内填写的订单号必须一致。");
        }

        const existingGroup = orderNoToGroup.get(row.orderNo);
        if (existingGroup && existingGroup !== row.orderGroup) {
          setError(rowErrors, row.rowNumber, `订单号 ${row.orderNo} 已被 Excel 内其他订单分组使用。`);
        } else {
          orderNoToGroup.set(row.orderNo, row.orderGroup);
        }
      }
    }

    if (row.orderGroup && row.productGroup) {
      const productKey = `${row.orderGroup}::${row.productGroup}`;
      const productGroup = productGroups.get(productKey);
      if (!productGroup) {
        productGroups.set(productKey, { ...row, firstRowNumber: row.rowNumber });
      } else {
        if (!sameValue(row.productName, productGroup.productName)) addConsistencyError(rowErrors, row.rowNumber, "同一产品分组的产品名称", productGroup.firstRowNumber);
        if (!sameValue(row.productQuantity, productGroup.productQuantity)) addConsistencyError(rowErrors, row.rowNumber, "同一产品分组的产品数量", productGroup.firstRowNumber);
        if (!sameValue(row.productSpecification, productGroup.productSpecification)) addConsistencyError(rowErrors, row.rowNumber, "同一产品分组的产品规格", productGroup.firstRowNumber);
        if (!sameValue(row.productMaterial, productGroup.productMaterial)) addConsistencyError(rowErrors, row.rowNumber, "同一产品分组的产品材质", productGroup.firstRowNumber);
        if (!sameValue(row.productSurfaceTreatment, productGroup.productSurfaceTreatment)) addConsistencyError(rowErrors, row.rowNumber, "同一产品分组的产品表面处理", productGroup.firstRowNumber);
        if (!sameValue(row.productRemark, productGroup.productRemark)) addConsistencyError(rowErrors, row.rowNumber, "同一产品分组的产品备注", productGroup.firstRowNumber);
      }

      if (row.partName) {
        if (row.partCode) {
          const codes = productPartCodes.get(productKey) ?? new Set<string>();
          if (codes.has(row.partCode)) {
            setError(rowErrors, row.rowNumber, `同一个产品下部件编号 ${row.partCode} 重复。`);
          }
          codes.add(row.partCode);
          productPartCodes.set(productKey, codes);
        } else {
          const names = productPartNamesWithoutCode.get(productKey) ?? new Set<string>();
          if (names.has(row.partName)) {
            setWarning(rowWarnings, row.rowNumber, `同一个产品下部件名称「${row.partName}」重复，且没有部件编号。`);
          }
          names.add(row.partName);
          productPartNamesWithoutCode.set(productKey, names);
        }
      }
    }

    const validUnitQuantity = typeof parsedUnitQuantity === "number" && !Number.isNaN(parsedUnitQuantity) ? parsedUnitQuantity : null;
    const validPartProductQuantity = typeof parsedPartProductQuantity === "number" && !Number.isNaN(parsedPartProductQuantity) ? parsedPartProductQuantity : null;
    const totalQuantity = row.partName && validUnitQuantity && validPartProductQuantity
      ? calculatePartTotalQuantity(validUnitQuantity, validPartProductQuantity)
      : null;

    normalizedRows.push({
      ...row,
      parsedProductQuantity: typeof parsedProductQuantity === "number" && !Number.isNaN(parsedProductQuantity) ? parsedProductQuantity : null,
      parsedUnitQuantity: validUnitQuantity,
      parsedPartProductQuantity: validPartProductQuantity,
      totalQuantity,
      errors: [],
      warnings: []
    });
  }

  const existingOrderNos = await loadExistingOrderNos(client, Array.from(explicitOrderNos));
  for (const row of normalizedRows) {
    if (row.orderNo && existingOrderNos.has(row.orderNo)) {
      setError(rowErrors, row.rowNumber, `订单号 ${row.orderNo} 已存在，不能重复导入。`);
    }
  }

  const existingCustomers = await loadExistingCustomers(client, Array.from(customerNames));
  for (const row of normalizedRows) {
    row.errors = rowErrors.get(row.rowNumber) ?? [];
    row.warnings = rowWarnings.get(row.rowNumber) ?? [];
    if (row.customerName && existingCustomers.has(normalizeKey(row.customerName))) {
      row.warnings.push(`客户「${row.customerName}」已存在，将复用已有客户资料。`);
    }
  }

  const errors = normalizedRows.flatMap((row) => row.errors.map((message) => ({ rowNumber: row.rowNumber, message })));
  const warnings = normalizedRows.flatMap((row) => row.warnings.map((message) => ({ rowNumber: row.rowNumber, message })));
  const productKeys = new Set(normalizedRows.filter((row) => row.orderGroup && row.productGroup).map((row) => `${row.orderGroup}::${row.productGroup}`));
  const partCount = normalizedRows.filter((row) => row.partName).length;
  const reusedCustomerNames = Array.from(customerNames).filter((name) => existingCustomers.has(name));
  const newCustomerNames = Array.from(customerNames).filter((name) => !existingCustomers.has(name));
  const groups = Array.from(orderGroups.values()).map((group) => {
    const orderRows = normalizedRows.filter((row) => row.orderGroup === group.orderGroup);
    const orderProductKeys = new Set(orderRows.filter((row) => row.productGroup).map((row) => row.productGroup));
    return {
      orderGroup: group.orderGroup,
      customerName: group.customerName,
      orderNo: group.orderNo || "系统自动生成",
      productCount: orderProductKeys.size,
      partCount: orderRows.filter((row) => row.partName).length
    };
  });

  return {
    rows: normalizedRows,
    groups,
    errors,
    warnings,
    summary: {
      rowCount: normalizedRows.length,
      orderCount: orderGroups.size,
      productCount: productKeys.size,
      partCount,
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

export async function confirmImportRows(inputRows: ImportRowInput[]): Promise<ImportConfirmResult> {
  return prisma.$transaction(async (tx) => {
    const preview = await validateImportRows(inputRows, tx);
    if (!preview.canConfirm) {
      const firstError = preview.errors[0];
      throw new Error(firstError ? `第 ${firstError.rowNumber} 行：${firstError.message}` : "导入数据校验失败。");
    }

    const rows = preview.rows;
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

    const orderGroups = Array.from(new Map(rows.map((row) => [row.orderGroup, row])).values());
    for (const orderGroupRow of orderGroups) {
      const customerKey = normalizeKey(orderGroupRow.customerName);
      let customerId = customerByName.get(customerKey);

      if (customerId) {
        reusedCustomerNames.add(customerKey);
      } else {
        const customer = await tx.customer.create({
          data: {
            name: orderGroupRow.customerName,
            contact: normalizeOptional(orderGroupRow.contact),
            phone: normalizeOptional(orderGroupRow.phone),
            address: normalizeOptional(orderGroupRow.address),
            remark: normalizeOptional(orderGroupRow.customerRemark)
          }
        });
        customerId = customer.id;
        customerByName.set(customerKey, customer.id);
        createdCustomerNames.add(customerKey);
      }

      const orderDate = toDate(orderGroupRow.orderDate);
      const deliveryDate = orderGroupRow.deliveryDate ? toDate(orderGroupRow.deliveryDate) : null;
      const orderNo = orderGroupRow.orderNo || await generateOrderNo(orderDate, tx, reservedOrderNos);
      if (orderGroupRow.orderNo && reservedOrderNos.has(orderNo)) {
        throw new Error(`订单号 ${orderNo} 与本次导入内已生成或已使用的订单号重复。`);
      }
      if (orderGroupRow.orderNo) reservedOrderNos.add(orderNo);

      const order = await tx.order.create({
        data: {
          orderNo,
          customerId,
          customerName: orderGroupRow.customerName,
          orderDate,
          deliveryDate,
          status: "PENDING",
          remark: normalizeOptional(orderGroupRow.orderRemark)
        }
      });
      newOrderCount += 1;

      const productRows = Array.from(
        new Map(rows.filter((row) => row.orderGroup === orderGroupRow.orderGroup).map((row) => [row.productGroup, row])).values()
      );
      const productIdByGroup = new Map<string, string>();

      for (const productRow of productRows) {
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
        productIdByGroup.set(productRow.productGroup, product.id);
        newProductCount += 1;
      }

      for (const partRow of rows.filter((row) => row.orderGroup === orderGroupRow.orderGroup && row.partName)) {
        const productId = productIdByGroup.get(partRow.productGroup);
        if (!productId || !partRow.parsedUnitQuantity || !partRow.parsedPartProductQuantity || !partRow.totalQuantity) {
          throw new Error(`第 ${partRow.rowNumber} 行：部件数据无效。`);
        }

        await tx.productPart.create({
          data: {
            orderId: order.id,
            productId,
            partName: partRow.partName,
            partCode: normalizeOptional(partRow.partCode),
            specification: normalizeOptional(partRow.partSpecification),
            material: normalizeOptional(partRow.partMaterial),
            unitQuantity: partRow.parsedUnitQuantity,
            productQuantity: partRow.parsedPartProductQuantity,
            totalQuantity: partRow.totalQuantity,
            surfaceTreatment: normalizeOptional(partRow.partSurfaceTreatment),
            color: normalizeOptional(partRow.color),
            outsourcedQuantity: 0,
            returnedQuantity: 0,
            missingQuantity: 0,
            status: "PENDING",
            remark: normalizeOptional(partRow.partRemark)
          }
        });
        newPartCount += 1;
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
