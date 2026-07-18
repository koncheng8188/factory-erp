import type { Prisma } from "@prisma/client";
import { requirePagePermission } from "@/lib/auth/authorization";
import { isOutsourceStatus } from "@/lib/outsource-status";
import { isOutsourceType } from "@/lib/outsource";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { OutsourcingManager } from "./outsourcing-manager";

export const dynamic = "force-dynamic";

type OutsourcingPageProps = {
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

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function earliestDate(dates: Date[]) {
  return dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

export default async function OutsourcingPage({ searchParams }: OutsourcingPageProps) {
  const user = await requirePagePermission("outsource.view");
  const canCreateOutsourceOrder =
    hasPermission(user.role, "order.view", []) &&
    hasPermission(user.role, "product.view", []) &&
    hasPermission(user.role, "part.view", []) &&
    hasPermission(user.role, "drawing.view", []) &&
    hasPermission(user.role, "outsource.view", []) &&
    hasPermission(user.role, "outsource.create", []);

  const params = await searchParams;
  const keyword = firstQueryValue(params?.keyword).trim();
  const rawStatus = firstQueryValue(params?.status).trim();
  const rawType = firstQueryValue(params?.type).trim();
  const supplier = firstQueryValue(params?.supplier).trim();
  const startDate = firstQueryValue(params?.startDate).trim();
  const endDate = firstQueryValue(params?.endDate).trim();
  const overdue = firstQueryValue(params?.overdue).trim() === "1";
  const status = isOutsourceStatus(rawStatus) ? rawStatus : "";
  const type = isOutsourceType(rawType) ? rawType : "";
  const parsedStartDate = parseDateFilter(startDate);
  const parsedEndDate = parseDateFilter(endDate);
  const andConditions: Prisma.OutsourceOrderWhereInput[] = [];

  if (keyword) {
    andConditions.push({
      OR: [
        { outsourceNo: { contains: keyword } },
        { supplierName: { contains: keyword } },
        { handler: { contains: keyword } },
        { items: { some: { order: { orderNo: { contains: keyword } } } } },
        { items: { some: { order: { customerName: { contains: keyword } } } } },
        { items: { some: { productName: { contains: keyword } } } },
        { items: { some: { partName: { contains: keyword } } } }
      ]
    });
  }

  if (status) {
    andConditions.push({ status });
  }

  if (type) {
    andConditions.push({ outsourceType: type });
  }

  if (supplier) {
    andConditions.push({ supplierName: { contains: supplier } });
  }

  const expectedReturnDateFilter: Prisma.DateTimeNullableFilter<"OutsourceOrder"> = {};
  const ltDates: Date[] = [];

  if (parsedStartDate) {
    expectedReturnDateFilter.gte = parsedStartDate;
  }

  if (parsedEndDate) {
    ltDates.push(nextDate(parsedEndDate));
  }

  if (overdue) {
    ltDates.push(startOfToday());
    andConditions.push({ status: { in: ["OUTSOURCED", "PARTIAL_RETURN"] } });
  }

  if (ltDates.length > 0) {
    expectedReturnDateFilter.lt = earliestDate(ltDates);
  }

  if (Object.keys(expectedReturnDateFilter).length > 0) {
    andConditions.push({ expectedReturnDate: expectedReturnDateFilter });
  }

  const where: Prisma.OutsourceOrderWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

  const outsourceOrders = await prisma.outsourceOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { items: true } }
    }
  });

  return (
    <OutsourcingManager
      outsourceOrders={outsourceOrders.map((order) => ({
        id: order.id,
        outsourceNo: order.outsourceNo,
        supplierName: order.supplierName,
        outsourceType: order.outsourceType,
        outsourceDate: order.outsourceDate.toISOString(),
        expectedReturnDate: order.expectedReturnDate?.toISOString() ?? null,
        status: order.status,
        handler: order.handler,
        remark: order.remark,
        itemCount: order._count.items
      }))}
      filters={{
        keyword,
        status,
        type,
        supplier,
        startDate: parsedStartDate ? startDate : "",
        endDate: parsedEndDate ? endDate : "",
        overdue
      }}
      canCreateOutsourceOrder={canCreateOutsourceOrder}
    />
  );
}
