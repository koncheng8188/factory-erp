import { Prisma, type OrderStatus, type PrismaClient, type ProductStatus } from "@prisma/client";

export const MAX_DELIVERY_CREATE_ATTEMPTS = 3;
export const PRISMA_INT_MAX = 2_147_483_647;

export class DeliveryIntegrityError extends Error {
  readonly status: number;
  readonly publicMessage: string;
  readonly cause?: unknown;

  constructor(status: number, publicMessage: string, cause?: unknown) {
    super(publicMessage);
    this.name = "DeliveryIntegrityError";
    this.status = status;
    this.publicMessage = publicMessage;
    this.cause = cause;
  }
}

type DeliveryItem = { productId: string; deliveryQuantity: number; remark: string | null };
type DeliveryInput = { orderId: string; deliveryDate: Date; dateKey: string; receiver: string | null; handler: string | null; remark: string | null; items: DeliveryItem[] };
export type DeliveryIntegrityDependencies = {
  beforeTransactionAttempt?: (attempt: number) => Promise<void> | void;
  afterSnapshotsValidated?: (context: { tx: Prisma.TransactionClient; attempt: number }) => Promise<void> | void;
  beforeProductConditionalUpdate?: (context: { tx: Prisma.TransactionClient; attempt: number; productId: string }) => Promise<void> | void;
  beforeOrderConditionalUpdate?: (context: { tx: Prisma.TransactionClient; attempt: number; orderId: string }) => Promise<void> | void;
  sleep?: (milliseconds: number) => Promise<void>;
  transaction?: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function optionalText(value: unknown, message: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new DeliveryIntegrityError(400, message);
  return value.trim() || null;
}
function parseDate(value: unknown) {
  if (typeof value !== "string") throw new DeliveryIntegrityError(400, "送货日期格式错误。");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new DeliveryIntegrityError(400, "送货日期格式错误。");
  const [, year, month, day] = match;
  const date = new Date(0); date.setHours(0, 0, 0, 0); date.setFullYear(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) throw new DeliveryIntegrityError(400, "送货日期格式错误。");
  return date;
}
function parseQuantity(value: unknown) {
  const quantity = typeof value === "number" ? value : typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > PRISMA_INT_MAX) throw new DeliveryIntegrityError(400, "送货数量必须是正安全整数。");
  return quantity;
}
function sum(items: Array<{ deliveryQuantity: number }>) {
  let total = 0;
  for (const item of items) { if (!Number.isSafeInteger(item.deliveryQuantity) || item.deliveryQuantity < 0 || total > Number.MAX_SAFE_INTEGER - item.deliveryQuantity) throw new DeliveryIntegrityError(409, "数据状态已变化，请刷新后重试。"); total += item.deliveryQuantity; }
  return total;
}
function known(error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code; }
export function isTransientDeliverySqliteError(error: unknown) {
  if (known(error, "P2034")) return true;
  if (known(error, "P1008") && /Socket timeout \(the database failed to respond to a query within the configured timeout/i.test(error.message)) return true;
  return error instanceof Prisma.PrismaClientUnknownRequestError && /\bSQLITE_BUSY\b|database is locked/i.test(error.message);
}
export function isDeliveryNumberConflict(error: unknown) {
  if (!known(error, "P2002")) return false;
  if (error.meta?.modelName !== undefined && error.meta.modelName !== "DeliveryOrder") return false;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.length === 1 && target[0] === "deliveryNo" : target === "deliveryNo";
}
async function defaultSleep(milliseconds: number) { await new Promise((resolve) => setTimeout(resolve, milliseconds)); }

export function validateDeliveryInput(raw: unknown): DeliveryInput {
  if (!isRecord(raw)) throw new DeliveryIntegrityError(400, "请求格式错误。");
  const orderId = typeof raw.orderId === "string" ? raw.orderId.trim() : "";
  if (!orderId) throw new DeliveryIntegrityError(400, "订单信息无效。");
  const deliveryDate = parseDate(raw.deliveryDate);
  if (!Array.isArray(raw.items) || raw.items.length === 0) throw new DeliveryIntegrityError(400, "请至少添加一条送货明细。");
  const productIds = new Set<string>();
  const items = raw.items.map((rawItem) => {
    if (!isRecord(rawItem)) throw new DeliveryIntegrityError(400, "产品信息无效。");
    const productId = typeof rawItem.productId === "string" ? rawItem.productId.trim() : "";
    if (!productId) throw new DeliveryIntegrityError(400, "产品信息无效。");
    if (productIds.has(productId)) throw new DeliveryIntegrityError(400, "同一产品不能重复添加。");
    productIds.add(productId);
    return { productId, deliveryQuantity: parseQuantity(rawItem.deliveryQuantity), remark: optionalText(rawItem.remark, "明细备注格式无效。") };
  });
  return { orderId, deliveryDate, dateKey: raw.deliveryDate as string, receiver: optionalText(raw.receiver, "收货人格式无效。"), handler: optionalText(raw.handler, "经手人格式无效。"), remark: optionalText(raw.remark, "备注格式无效。"), items };
}

function productStatus(delivered: number, quantity: number): ProductStatus {
  if (delivered > quantity || quantity <= 0) throw new DeliveryIntegrityError(409, "数据状态已变化，请刷新后重试。");
  if (delivered === 0) return "WAIT_DELIVERY";
  return delivered < quantity ? "PARTIAL_DELIVERED" : "COMPLETED";
}
function orderStatus(products: Array<{ status: ProductStatus }>): OrderStatus {
  if (products.length === 0) throw new DeliveryIntegrityError(409, "数据状态已变化，请刷新后重试。");
  if (products.every((product) => product.status === "COMPLETED")) return "COMPLETED";
  if (products.some((product) => product.status === "PARTIAL_DELIVERED" || product.status === "COMPLETED")) return "PARTIAL_DELIVERED";
  throw new DeliveryIntegrityError(409, "数据状态已变化，请刷新后重试。");
}

async function createAttempt(tx: Prisma.TransactionClient, input: DeliveryInput, attempt: number, dependencies?: DeliveryIntegrityDependencies) {
  const order = await tx.order.findUnique({ where: { id: input.orderId }, select: { id: true, customerId: true, customerName: true, status: true, customer: { select: { id: true } } } });
  if (!order) throw new DeliveryIntegrityError(404, "订单不存在。");
  const productIds = input.items.map((item) => item.productId);
  const products = await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, orderId: true, productName: true, specification: true, quantity: true, status: true } });
  if (products.length !== productIds.length) throw new DeliveryIntegrityError(404, "部分产品不存在。");
  const items = await tx.deliveryOrderItem.findMany({ where: { productId: { in: productIds } }, select: { productId: true, deliveryQuantity: true } });
  const byId = new Map(products.map((product) => [product.id, product]));
  if (order.status === "COMPLETED") throw new DeliveryIntegrityError(409, "已完成订单不能创建送货单。");
  if (order.status === "ABNORMAL") throw new DeliveryIntegrityError(409, "异常订单不能创建送货单。");
  if (order.status !== "WAIT_DELIVERY" && order.status !== "PARTIAL_DELIVERED") throw new DeliveryIntegrityError(409, "订单当前状态不能创建送货单。");
  for (const item of input.items) {
    const product = byId.get(item.productId)!;
    if (product.orderId !== order.id) throw new DeliveryIntegrityError(409, "产品不属于当前订单。");
    if (product.status !== "WAIT_DELIVERY" && product.status !== "PARTIAL_DELIVERED") throw new DeliveryIntegrityError(409, "产品当前状态不能送货。");
    const delivered = sum(items.filter((history) => history.productId === product.id));
    if (delivered > product.quantity || product.quantity <= 0) throw new DeliveryIntegrityError(409, "数据状态已变化，请刷新后重试。");
    if (item.deliveryQuantity > product.quantity - delivered) throw new DeliveryIntegrityError(409, "送货数量超过当前可送数量。");
  }
  const prefix = `SH${input.dateKey.replaceAll("-", "")}`;
  const candidates = await tx.deliveryOrder.findMany({ where: { deliveryNo: { startsWith: prefix } }, select: { deliveryNo: true } });
  const serials = candidates.map(({ deliveryNo }) => new RegExp(`^${prefix}\\d{3}$`).test(deliveryNo) ? Number(deliveryNo.slice(-3)) : 0);
  const serial = Math.max(0, ...serials);
  if (serial >= 999) throw new DeliveryIntegrityError(409, "当日送货单数量已达到上限。");
  await dependencies?.afterSnapshotsValidated?.({ tx, attempt });
  const created = await tx.deliveryOrder.create({ data: { deliveryNo: `${prefix}${String(serial + 1).padStart(3, "0")}`, orderId: order.id, customerId: order.customerId, customerName: order.customerName, deliveryDate: input.deliveryDate, receiver: input.receiver, handler: input.handler, remark: input.remark, status: "PARTIAL_DELIVERED" } });
  for (const item of input.items) { const product = byId.get(item.productId)!; await tx.deliveryOrderItem.create({ data: { deliveryOrderId: created.id, orderId: order.id, productId: product.id, productName: product.productName, specification: product.specification, deliveryQuantity: item.deliveryQuantity, remark: item.remark } }); }
  const latestItems = await tx.deliveryOrderItem.findMany({ where: { productId: { in: productIds } }, select: { productId: true, deliveryQuantity: true } });
  for (const product of products) {
    await dependencies?.beforeProductConditionalUpdate?.({ tx, attempt, productId: product.id });
    const status = productStatus(sum(latestItems.filter((item) => item.productId === product.id)), product.quantity);
    if ((await tx.product.updateMany({ where: { id: product.id, orderId: order.id, quantity: product.quantity, status: product.status }, data: { status } })).count !== 1) throw new DeliveryIntegrityError(409, "数据状态已变化，请刷新后重试。");
  }
  const refreshedOrder = await tx.order.findUnique({ where: { id: order.id }, select: { status: true, products: { select: { status: true } } } });
  if (!refreshedOrder || refreshedOrder.status !== order.status) throw new DeliveryIntegrityError(409, "数据状态已变化，请刷新后重试。");
  const nextOrderStatus = orderStatus(refreshedOrder.products);
  await dependencies?.beforeOrderConditionalUpdate?.({ tx, attempt, orderId: order.id });
  if ((await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: nextOrderStatus } })).count !== 1) throw new DeliveryIntegrityError(409, "数据状态已变化，请刷新后重试。");
  const finalDeliveryStatus = nextOrderStatus === "COMPLETED" ? "DELIVERED" : "PARTIAL_DELIVERED";
  if ((await tx.deliveryOrder.updateMany({ where: { id: created.id, status: "PARTIAL_DELIVERED" }, data: { status: finalDeliveryStatus } })).count !== 1) throw new DeliveryIntegrityError(409, "数据状态已变化，请刷新后重试。");
  return tx.deliveryOrder.findUniqueOrThrow({ where: { id: created.id } });
}

export async function createDeliveryIntegrity({ client, input: rawInput, dependencies }: { client: PrismaClient; input: unknown; dependencies?: DeliveryIntegrityDependencies }) {
  const input = validateDeliveryInput(rawInput);
  for (let attempt = 1; attempt <= MAX_DELIVERY_CREATE_ATTEMPTS; attempt += 1) {
    await dependencies?.beforeTransactionAttempt?.(attempt);
    try { return await (dependencies?.transaction ?? ((callback) => client.$transaction(callback)))((tx) => createAttempt(tx, input, attempt, dependencies)); }
    catch (error) {
      if (error instanceof DeliveryIntegrityError) throw error;
      if (isDeliveryNumberConflict(error)) { if (attempt === MAX_DELIVERY_CREATE_ATTEMPTS) throw new DeliveryIntegrityError(409, "数据发生唯一性冲突，请刷新后重试。", error); await (dependencies?.sleep ?? defaultSleep)(attempt * 20); continue; }
      if (known(error, "P2002")) throw new DeliveryIntegrityError(409, "数据发生唯一性冲突，请刷新后重试。", error);
      if (known(error, "P2003")) throw new DeliveryIntegrityError(409, "关联数据已变化，请刷新后重试。", error);
      if (known(error, "P2025")) throw new DeliveryIntegrityError(409, "数据状态已变化，请刷新后重试。", error);
      if (!isTransientDeliverySqliteError(error)) throw new DeliveryIntegrityError(500, "创建送货单失败，请稍后重试。", error);
      if (attempt === MAX_DELIVERY_CREATE_ATTEMPTS) throw new DeliveryIntegrityError(503, "系统繁忙，请稍后重试。", error);
      await (dependencies?.sleep ?? defaultSleep)(attempt * 20);
    }
  }
  throw new DeliveryIntegrityError(503, "系统繁忙，请稍后重试。");
}
