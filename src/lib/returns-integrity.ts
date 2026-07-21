import { Prisma, type OrderStatus, type PrismaClient, type ProductPartStatus, type ProductStatus } from "@prisma/client";
import { calculateOrderStatusFromProducts, calculateProtectedProductStatus } from "@/lib/product-progress";
import { resolveOutsourceItemStatus, resolvePartStatus } from "@/lib/returns";

export const MAX_RETURN_CREATE_ATTEMPTS = 3;
export const PRISMA_INT_MAX = 2_147_483_647;

export class ReturnsIntegrityError extends Error {
  readonly status: number;
  readonly cause?: unknown;

  constructor(status: number, message: string, cause?: unknown) {
    super(message);
    this.name = "ReturnsIntegrityError";
    this.status = status;
    this.cause = cause;
  }
}

export type ReturnsIntegrityDependencies = {
  sleep?: (milliseconds: number) => Promise<void>;
  beforeTransactionAttempt?: (attempt: number) => Promise<void> | void;
  afterSnapshotsValidated?: (context: { tx: Prisma.TransactionClient; attempt: number }) => Promise<void> | void;
  beforeItemConditionalUpdate?: (context: { tx: Prisma.TransactionClient; attempt: number; itemId: string }) => Promise<void> | void;
  beforePartConditionalUpdate?: (context: { tx: Prisma.TransactionClient; attempt: number; partId: string }) => Promise<void> | void;
  beforeOutsourceOrderConditionalUpdate?: (context: { tx: Prisma.TransactionClient; attempt: number; outsourceOrderId: string }) => Promise<void> | void;
  transaction?: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
};

type ReturnInput = { outsourceOrderItemId: string; returnQuantity: number; abnormalQuantity: number; abnormalReason: string | null; remark: string | null };
type ValidatedInput = { outsourceOrderId: string; returnDate: Date; handler: string | null; remark: string | null; items: ReturnInput[] };

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseQuantity(value: unknown) {
  if (value === undefined || value === "") return 0;
  const quantity = typeof value === "number"
    ? value
    : typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > PRISMA_INT_MAX) {
    throw new ReturnsIntegrityError(400, "回厂数量必须是非负安全整数。");
  }
  return quantity;
}

function parseReturnDate(value: unknown) {
  if (typeof value !== "string") throw new ReturnsIntegrityError(400, "回厂日期格式错误。");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ReturnsIntegrityError(400, "回厂日期格式错误。");
  const [, yearText, monthText, dayText] = match;
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
  if (date.getFullYear() !== Number(yearText) || date.getMonth() !== Number(monthText) - 1 || date.getDate() !== Number(dayText)) {
    throw new ReturnsIntegrityError(400, "回厂日期格式错误。");
  }
  return date;
}

function validateInput(raw: unknown): ValidatedInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ReturnsIntegrityError(400, "请求格式错误。");
  const body = raw as Record<string, unknown>;
  const outsourceOrderId = typeof body.outsourceOrderId === "string" ? body.outsourceOrderId.trim() : "";
  if (!outsourceOrderId) throw new ReturnsIntegrityError(400, "外发单信息无效。");
  if (body.handler !== undefined && body.handler !== null && typeof body.handler !== "string") throw new ReturnsIntegrityError(400, "经手人格式无效。");
  if (!Array.isArray(body.items) || body.items.length === 0) throw new ReturnsIntegrityError(400, "请至少添加一条回厂明细。");
  const ids = new Set<string>();
  const items = body.items.map((rawItem) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) throw new ReturnsIntegrityError(400, "外发明细信息无效。");
    const item = rawItem as Record<string, unknown>;
    const outsourceOrderItemId = typeof item.outsourceOrderItemId === "string" ? item.outsourceOrderItemId.trim() : "";
    if (!outsourceOrderItemId) throw new ReturnsIntegrityError(400, "外发明细信息无效。");
    if (ids.has(outsourceOrderItemId)) throw new ReturnsIntegrityError(400, "同一外发明细不能重复添加。");
    ids.add(outsourceOrderItemId);
    const returnQuantity = parseQuantity(item.returnQuantity);
    const abnormalQuantity = parseQuantity(item.abnormalQuantity);
    const physicalReturnedQuantity = returnQuantity + abnormalQuantity;
    if (!Number.isSafeInteger(physicalReturnedQuantity) || physicalReturnedQuantity > PRISMA_INT_MAX) {
      throw new ReturnsIntegrityError(400, "回厂数量必须是非负安全整数。");
    }
    if (physicalReturnedQuantity <= 0) throw new ReturnsIntegrityError(400, "正常回厂数量与异常数量合计必须大于0。");
    const abnormalReason = optionalText(item.abnormalReason);
    if (abnormalQuantity > 0 && !abnormalReason) throw new ReturnsIntegrityError(400, "异常回厂原因不能为空。");
    return { outsourceOrderItemId, returnQuantity, abnormalQuantity, abnormalReason, remark: optionalText(item.remark) };
  });
  return { outsourceOrderId, returnDate: parseReturnDate(body.returnDate), handler: optionalText(body.handler), remark: optionalText(body.remark), items };
}

function known(error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export function isTransientReturnsSqliteError(error: unknown) {
  if (known(error, "P2034")) return true;
  if (known(error, "P1008") && /Socket timeout \(the database failed to respond to a query within the configured timeout/i.test(error.message)) return true;
  return error instanceof Prisma.PrismaClientUnknownRequestError && /\bSQLITE_BUSY\b|database is locked/i.test(error.message);
}

async function sleep(milliseconds: number) { await new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function validStored(value: number) { return Number.isSafeInteger(value) && value >= 0 && value <= PRISMA_INT_MAX; }
function maxDate(dates: Date[]) { return dates.reduce((latest, date) => date > latest ? date : latest); }

async function updateProduct(tx: Prisma.TransactionClient, productId: string, expectedStatus: ProductStatus) {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, status: true, parts: { select: { status: true } } } });
  if (!product || product.status !== expectedStatus) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。");
  if (product.status === "COMPLETED") throw new ReturnsIntegrityError(409, "已完成产品不能登记回厂。");
  const status = product.status === "ABNORMAL" ? "ABNORMAL" : calculateProtectedProductStatus(product.status, product.parts);
  if (status !== product.status && (await tx.product.updateMany({ where: { id: product.id, status: product.status }, data: { status } })).count !== 1) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。");
}

async function updateOrder(tx: Prisma.TransactionClient, orderId: string, expectedStatus: OrderStatus) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, products: { select: { status: true } } } });
  if (!order || order.status !== expectedStatus) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。");
  if (order.status === "COMPLETED") throw new ReturnsIntegrityError(409, "已完成订单不能登记回厂。");
  const status = order.status === "ABNORMAL" ? "ABNORMAL" : calculateOrderStatusFromProducts(order.status, order.products);
  if (status !== order.status && (await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status } })).count !== 1) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。");
}

async function createAttempt(tx: Prisma.TransactionClient, input: ValidatedInput, attempt: number, dependencies?: ReturnsIntegrityDependencies) {
  const outsourceOrder = await tx.outsourceOrder.findUnique({ where: { id: input.outsourceOrderId }, select: { id: true, status: true, actualReturnDate: true } });
  if (!outsourceOrder) throw new ReturnsIntegrityError(404, "外发单不存在，请刷新后重试。");
  const itemIds = input.items.map((item) => item.outsourceOrderItemId);
  const items = await tx.outsourceOrderItem.findMany({ where: { id: { in: itemIds } }, include: { part: { select: { id: true, productId: true, orderId: true, status: true, totalQuantity: true, outsourcedQuantity: true, returnedQuantity: true, missingQuantity: true, product: { select: { status: true } }, order: { select: { status: true } } } } } });
  if (items.length !== itemIds.length) throw new ReturnsIntegrityError(404, "部分外发明细不存在，请刷新后重试。");
  const byId = new Map(items.map((item) => [item.id, item]));
  const partIds = [...new Set(items.map((item) => item.partId))];
  const historicalAbnormal = await tx.outsourceReturnItem.findMany({ where: { abnormalQuantity: { gt: 0 }, OR: [{ outsourceOrderItemId: { in: itemIds } }, { partId: { in: partIds } }] }, select: { outsourceOrderItemId: true, partId: true } });
  const abnormalItems = new Set(historicalAbnormal.map((item) => item.outsourceOrderItemId));
  const abnormalParts = new Set(historicalAbnormal.map((item) => item.partId));
  const prepared = input.items.map((inputItem) => {
    const item = byId.get(inputItem.outsourceOrderItemId)!;
    if (item.outsourceOrderId !== input.outsourceOrderId) throw new ReturnsIntegrityError(409, "外发明细不属于当前外发单。");
    if (!validStored(item.outsourceQuantity) || !validStored(item.returnedQuantity) || !validStored(item.missingQuantity) || item.returnedQuantity > item.outsourceQuantity || item.missingQuantity !== item.outsourceQuantity - item.returnedQuantity) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。");
    const physical = inputItem.returnQuantity + inputItem.abnormalQuantity;
    if (item.missingQuantity <= 0) throw new ReturnsIntegrityError(409, "该外发明细已全部回厂。");
    if (physical > item.missingQuantity) throw new ReturnsIntegrityError(409, "回厂数量超过当前未回数量。");
    if (item.part.product.status === "COMPLETED") throw new ReturnsIntegrityError(409, "已完成产品不能登记回厂。");
    if (item.part.order.status === "COMPLETED") throw new ReturnsIntegrityError(409, "已完成订单不能登记回厂。");
    return { input: inputItem, item, physical };
  });
  await dependencies?.afterSnapshotsValidated?.({ tx, attempt });
  const result = await tx.outsourceReturn.create({ data: { outsourceOrderId: input.outsourceOrderId, returnDate: input.returnDate, handler: input.handler, remark: input.remark } });
  const productStatuses = new Map<string, ProductStatus>(); const orderStatuses = new Map<string, OrderStatus>();
  const groupedParts = new Map<string, { part: typeof prepared[number]["item"]["part"]; physical: number; abnormal: boolean }>();
  for (const preparedItem of prepared) {
    const { item, input: itemInput, physical } = preparedItem;
    await tx.outsourceReturnItem.create({ data: { outsourceReturnId: result.id, outsourceOrderItemId: item.id, partId: item.partId, returnQuantity: itemInput.returnQuantity, abnormalQuantity: itemInput.abnormalQuantity, abnormalReason: itemInput.abnormalReason, remark: itemInput.remark } });
    await dependencies?.beforeItemConditionalUpdate?.({ tx, attempt, itemId: item.id });
    const returnedQuantity = item.returnedQuantity + physical; const missingQuantity = item.missingQuantity - physical;
    const status = resolveOutsourceItemStatus({ outsourceQuantity: item.outsourceQuantity, returnedQuantity, hasAbnormal: item.status === "ABNORMAL" || abnormalItems.has(item.id) || itemInput.abnormalQuantity > 0 });
    if ((await tx.outsourceOrderItem.updateMany({ where: { id: item.id, outsourceOrderId: input.outsourceOrderId, status: item.status, outsourceQuantity: item.outsourceQuantity, returnedQuantity: item.returnedQuantity, missingQuantity: item.missingQuantity }, data: { returnedQuantity: { increment: physical }, missingQuantity: { decrement: physical }, status } })).count !== 1) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。");
    productStatuses.set(item.productId, item.part.product.status); orderStatuses.set(item.orderId, item.part.order.status);
    const group = groupedParts.get(item.partId); groupedParts.set(item.partId, group ? { ...group, physical: group.physical + physical, abnormal: group.abnormal || itemInput.abnormalQuantity > 0 } : { part: item.part, physical, abnormal: itemInput.abnormalQuantity > 0 });
  }
  for (const [partId, group] of groupedParts) {
    const part = group.part;
    if (!validStored(part.totalQuantity) || !validStored(part.outsourcedQuantity) || !validStored(part.returnedQuantity) || !validStored(part.missingQuantity) || part.returnedQuantity > part.outsourcedQuantity || part.missingQuantity !== part.outsourcedQuantity - part.returnedQuantity || part.returnedQuantity + group.physical > part.outsourcedQuantity) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。");
    await dependencies?.beforePartConditionalUpdate?.({ tx, attempt, partId });
    const returnedQuantity = part.returnedQuantity + group.physical;
    const status = resolvePartStatus({ outsourcedQuantity: part.outsourcedQuantity, returnedQuantity, hasAbnormal: part.status === "ABNORMAL" || abnormalParts.has(partId) || group.abnormal });
    if ((await tx.productPart.updateMany({ where: { id: partId, status: part.status, totalQuantity: part.totalQuantity, outsourcedQuantity: part.outsourcedQuantity, returnedQuantity: part.returnedQuantity, missingQuantity: part.missingQuantity }, data: { returnedQuantity: { increment: group.physical }, missingQuantity: { decrement: group.physical }, status } })).count !== 1) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }
  for (const [productId, status] of productStatuses) await updateProduct(tx, productId, status);
  for (const [orderId, status] of orderStatuses) await updateOrder(tx, orderId, status);
  const latest = await tx.outsourceOrder.findUnique({ where: { id: input.outsourceOrderId }, include: { items: { select: { status: true, missingQuantity: true, returnedQuantity: true } }, returns: { select: { returnDate: true } } } });
  if (!latest || latest.status !== outsourceOrder.status || latest.actualReturnDate?.getTime() !== outsourceOrder.actualReturnDate?.getTime()) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。");
  const allReturned = latest.items.length > 0 && latest.items.every((item) => item.missingQuantity === 0);
  const status = latest.items.some((item) => item.status === "ABNORMAL") ? "ABNORMAL" : allReturned ? "RETURNED" : latest.items.some((item) => item.returnedQuantity > 0) ? "PARTIAL_RETURN" : "OUTSOURCED";
  const actualReturnDate = allReturned ? maxDate([...latest.returns.map((item) => item.returnDate), ...(outsourceOrder.actualReturnDate ? [outsourceOrder.actualReturnDate] : [])]) : outsourceOrder.actualReturnDate;
  await dependencies?.beforeOutsourceOrderConditionalUpdate?.({ tx, attempt, outsourceOrderId: outsourceOrder.id });
  if ((await tx.outsourceOrder.updateMany({ where: { id: outsourceOrder.id, status: outsourceOrder.status, actualReturnDate: outsourceOrder.actualReturnDate }, data: { status, actualReturnDate } })).count !== 1) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。");
  return result;
}

export async function createOutsourceReturnIntegrity({ client, input: rawInput, dependencies }: { client: PrismaClient; input: unknown; dependencies?: ReturnsIntegrityDependencies }) {
  const input = validateInput(rawInput);
  for (let attempt = 1; attempt <= MAX_RETURN_CREATE_ATTEMPTS; attempt += 1) {
    await dependencies?.beforeTransactionAttempt?.(attempt);
    try {
      if (dependencies?.transaction) return await dependencies.transaction((tx) => createAttempt(tx, input, attempt, dependencies));
      return await client.$transaction((tx) => createAttempt(tx, input, attempt, dependencies));
    }
    catch (error) {
      if (error instanceof ReturnsIntegrityError) throw error;
      if (known(error, "P2002")) throw new ReturnsIntegrityError(409, "数据发生唯一性冲突，请刷新后重试。", error);
      if (known(error, "P2003")) throw new ReturnsIntegrityError(409, "关联数据已变化，请刷新后重试。", error);
      if (known(error, "P2025")) throw new ReturnsIntegrityError(409, "数据状态已变化，请刷新后重试。", error);
      if (!isTransientReturnsSqliteError(error)) throw new ReturnsIntegrityError(500, "保存回厂记录失败，请稍后重试。", error);
      if (attempt === MAX_RETURN_CREATE_ATTEMPTS) throw new ReturnsIntegrityError(503, "系统繁忙，请稍后重试。", error);
      await (dependencies?.sleep ?? sleep)(attempt * 20);
    }
  }
  throw new ReturnsIntegrityError(503, "系统繁忙，请稍后重试。");
}
