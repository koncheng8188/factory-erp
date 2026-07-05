import { prisma } from "@/lib/prisma";

export const deliverableProductStatuses = new Set(["WAIT_DELIVERY", "PARTIAL_DELIVERED"]);

export function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDate(value: unknown, fallback = new Date()) {
  if (typeof value !== "string" || !value) {
    return fallback;
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function normalizeOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function formatDateInput(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function formatDisplayDate(value: Date | string | null) {
  return formatDateInput(value) || "-";
}

export function formatDeliveryDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function generateDeliveryNo(deliveryDate: Date) {
  const prefix = `SH${formatDeliveryDate(deliveryDate)}`;
  const latestOrder = await prisma.deliveryOrder.findFirst({
    where: { deliveryNo: { startsWith: prefix } },
    orderBy: { deliveryNo: "desc" },
    select: { deliveryNo: true }
  });
  const latestSerial = latestOrder ? Number(latestOrder.deliveryNo.slice(-3)) : 0;
  return `${prefix}${String(latestSerial + 1).padStart(3, "0")}`;
}

export function deliveredQuantityFromItems(items: { deliveryQuantity: number }[]) {
  return items.reduce((sum, item) => sum + item.deliveryQuantity, 0);
}

export function missingDeliveryQuantity(productQuantity: number, deliveredQuantity: number) {
  return Math.max(productQuantity - deliveredQuantity, 0);
}

export function canDeliverProduct(status: string, missingQuantity: number) {
  return deliverableProductStatuses.has(status) && missingQuantity > 0;
}
