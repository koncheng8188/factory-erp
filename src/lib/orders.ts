import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type OrderClient = PrismaClient | Prisma.TransactionClient;

export function formatOrderDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function generateOrderNo(
  orderDate: Date,
  client: OrderClient = prisma,
  reservedOrderNos = new Set<string>()
) {
  const prefix = `DD${formatOrderDate(orderDate)}`;
  const latestOrder = await client.order.findFirst({
    where: { orderNo: { startsWith: prefix } },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true }
  });
  let serial = latestOrder ? Number(latestOrder.orderNo.slice(-3)) : 0;
  let orderNo = "";

  do {
    serial += 1;
    orderNo = `${prefix}${String(serial).padStart(3, "0")}`;
  } while (reservedOrderNos.has(orderNo));

  reservedOrderNos.add(orderNo);
  return orderNo;
}
