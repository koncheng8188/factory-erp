import type { Prisma } from "@prisma/client";
import { requirePagePermission } from "@/lib/auth/authorization";
import { isOrderStatus } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import { OrderManager } from "./order-manager";

export const dynamic = "force-dynamic";

type OrdersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseDateFilter(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nextDate(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  await requirePagePermission("order.view");

  const params = await searchParams;
  const keyword = firstQueryValue(params?.keyword).trim();
  const rawStatus = firstQueryValue(params?.status).trim();
  const startDate = firstQueryValue(params?.startDate).trim();
  const endDate = firstQueryValue(params?.endDate).trim();
  const status = isOrderStatus(rawStatus) ? rawStatus : "";
  const parsedStartDate = parseDateFilter(startDate);
  const parsedEndDate = parseDateFilter(endDate);
  const where: Prisma.OrderWhereInput = {};

  if (keyword) {
    where.OR = [
      { orderNo: { contains: keyword } },
      { customerName: { contains: keyword } },
      { products: { some: { productName: { contains: keyword } } } }
    ];
  }

  if (status) {
    where.status = status;
  }

  if (parsedStartDate || parsedEndDate) {
    where.orderDate = {
      ...(parsedStartDate ? { gte: parsedStartDate } : {}),
      ...(parsedEndDate ? { lt: nextDate(parsedEndDate) } : {})
    };
  }

  const [orders, customers] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { products: true } } }
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } })
  ]);

  return (
    <OrderManager
      orders={orders}
      customers={customers}
      filters={{
        keyword,
        status,
        startDate: parsedStartDate ? startDate : "",
        endDate: parsedEndDate ? endDate : ""
      }}
    />
  );
}
