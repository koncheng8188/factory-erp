import { prisma } from "@/lib/prisma";

export const outsourceTypeOptions = [
  { value: "ELECTROPLATING", label: "电镀" },
  { value: "POWDER_COATING", label: "喷粉" },
  { value: "OXIDATION", label: "氧化" },
  { value: "WIRE_DRAWING", label: "拉丝" },
  { value: "OTHER", label: "其他" }
] as const;

export type OutsourceTypeValue = (typeof outsourceTypeOptions)[number]["value"];

export const outsourceTypeLabels = Object.fromEntries(
  outsourceTypeOptions.map((option) => [option.value, option.label])
) as Record<OutsourceTypeValue, string>;

export function isOutsourceType(value: unknown): value is OutsourceTypeValue {
  return typeof value === "string" && outsourceTypeOptions.some((option) => option.value === value);
}

export function normalizeOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseDate(value: unknown, fallback = new Date()) {
  if (typeof value !== "string" || !value) {
    return fallback;
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : date;
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

export function formatOutsourceDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function generateOutsourceNo(outsourceDate: Date) {
  const prefix = `WF${formatOutsourceDate(outsourceDate)}`;
  const latestOrder = await prisma.outsourceOrder.findFirst({
    where: { outsourceNo: { startsWith: prefix } },
    orderBy: { outsourceNo: "desc" },
    select: { outsourceNo: true }
  });
  const latestSerial = latestOrder ? Number(latestOrder.outsourceNo.slice(-3)) : 0;
  return `${prefix}${String(latestSerial + 1).padStart(3, "0")}`;
}

export type DrawingSnapshot = {
  id: string;
  status: string;
  isMain: boolean;
  thumbnailUrl: string | null;
  printThumbnailUrl: string | null;
  originalUrl: string;
  fileType: string | null;
  createdAt: Date | string;
  version: number;
};

export function pickOutsourceDrawing(drawings: DrawingSnapshot[]) {
  const confirmedMain = drawings.find((drawing) => drawing.status === "CONFIRMED" && drawing.isMain);
  if (confirmedMain) return confirmedMain;

  const main = drawings.find((drawing) => drawing.isMain);
  if (main) return main;

  return drawings.find((drawing) => drawing.status !== "OBSOLETE") ?? null;
}
