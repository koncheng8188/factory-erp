import { Prisma } from "@prisma/client";
import type { Order, PrismaClient } from "@prisma/client";

type OrderClient = PrismaClient | Prisma.TransactionClient;

export type GeneratedOrderInput = {
  customerId: string;
  customerName: string;
  orderDate: Date;
  deliveryDate: Date | null;
  remark: string | null;
};

const MAX_ORDER_CREATE_ATTEMPTS = 3;

export class OrderDailySequenceLimitError extends Error {
  constructor() {
    super("当日订单编号已达 999 上限，无法新增订单。");
    this.name = "OrderDailySequenceLimitError";
  }
}

export class OrderNumberConflictError extends Error {
  constructor() {
    super("订单编号生成冲突，请重试。");
    this.name = "OrderNumberConflictError";
  }
}

export function formatOrderDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function generateOrderNo(
  orderDate: Date,
  client: OrderClient,
  reservedOrderNos = new Set<string>()
) {
  const prefix = `DD${formatOrderDate(orderDate)}`;
  const orders = await client.order.findMany({
    where: { orderNo: { startsWith: prefix } },
    select: { orderNo: true }
  });
  const validOrderNoPattern = new RegExp(`^${prefix}(\\d{3})$`);
  let maximumSerial = 0;

  for (const orderNo of [
    ...orders.map((order) => order.orderNo),
    ...reservedOrderNos
  ]) {
    const match = validOrderNoPattern.exec(orderNo);
    if (!match) continue;
    const serial = Number(match[1]);
    if (serial < 1) continue;
    maximumSerial = Math.max(maximumSerial, serial);
  }

  if (maximumSerial >= 999) {
    throw new OrderDailySequenceLimitError();
  }

  const orderNo = `${prefix}${String(maximumSerial + 1).padStart(3, "0")}`;
  reservedOrderNos.add(orderNo);
  return orderNo;
}

function isOrderNoUniqueConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const meta = error.meta;
  if (meta && Object.prototype.hasOwnProperty.call(meta, "modelName") && meta.modelName !== "Order") {
    return false;
  }

  const target = meta?.target;
  const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
  return fields.length === 1 && fields[0] === "orderNo";
}

export async function createOrderWithGeneratedNo(
  client: OrderClient,
  input: GeneratedOrderInput
): Promise<Order> {
  for (let attempt = 1; attempt <= MAX_ORDER_CREATE_ATTEMPTS; attempt += 1) {
    const orderNo = await generateOrderNo(input.orderDate, client);

    try {
      return await client.order.create({
        data: {
          orderNo,
          customerId: input.customerId,
          customerName: input.customerName,
          orderDate: input.orderDate,
          deliveryDate: input.deliveryDate,
          status: "PENDING",
          remark: input.remark
        }
      });
    } catch (error) {
      if (!isOrderNoUniqueConflict(error)) throw error;
      if (attempt === MAX_ORDER_CREATE_ATTEMPTS) {
        throw new OrderNumberConflictError();
      }
    }
  }

  throw new OrderNumberConflictError();
}
