import type { OutsourceOrderStatus } from "@prisma/client";

export const outsourceStatusOptions: { value: OutsourceOrderStatus; label: string }[] = [
  { value: "DRAFT", label: "草稿" },
  { value: "OUTSOURCED", label: "待回厂" },
  { value: "PARTIAL_RETURN", label: "部分回厂" },
  { value: "RETURNED", label: "已回厂" },
  { value: "ABNORMAL", label: "异常" }
];

export const outsourceStatusLabels = Object.fromEntries(
  outsourceStatusOptions.map((option) => [option.value, option.label])
) as Record<OutsourceOrderStatus, string>;

export function isOutsourceStatus(value: string): value is OutsourceOrderStatus {
  return value in outsourceStatusLabels;
}

export function getOutsourceStatusLabel(status: string) {
  return outsourceStatusLabels[status as OutsourceOrderStatus] ?? status;
}
