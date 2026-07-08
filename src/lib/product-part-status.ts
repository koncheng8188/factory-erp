import type { ProductPartStatus } from "@prisma/client";

export const productPartStatusOptions: { value: ProductPartStatus; label: string }[] = [
  { value: "PENDING", label: "下料中" },
  { value: "CUTTING", label: "下料中" },
  { value: "WELDING", label: "焊接中" },
  { value: "POLISHING", label: "抛光中" },
  { value: "WAIT_OUTSOURCE", label: "待外发" },
  { value: "OUTSOURCING", label: "外发中" },
  { value: "PARTIAL_RETURN", label: "部分回厂" },
  { value: "RETURNED", label: "已回厂" },
  { value: "ABNORMAL", label: "异常" }
];

export const productPartStatusLabels = Object.fromEntries(
  productPartStatusOptions.map((option) => [option.value, option.label])
) as Record<ProductPartStatus, string>;

export function isProductPartStatus(value: string): value is ProductPartStatus {
  return value in productPartStatusLabels;
}

export function getProductPartStatusLabel(status: string) {
  return productPartStatusLabels[status as ProductPartStatus] ?? status;
}
