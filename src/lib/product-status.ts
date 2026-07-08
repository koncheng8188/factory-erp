import type { ProductStatus } from "@prisma/client";

export const productStatusLabels = {
  PENDING: "下料中",
  CUTTING: "下料中",
  WELDING: "焊接中",
  POLISHING: "抛光中",
  WAIT_OUTSOURCE: "待外发",
  OUTSOURCING: "外发中",
  PARTIAL_RETURN: "部分回厂",
  RETURNED: "已回厂",
  WAIT_DELIVERY: "待送货",
  PARTIAL_DELIVERED: "部分送货",
  COMPLETED: "已完成",
  ABNORMAL: "异常"
} satisfies Record<ProductStatus, string>;

export const productionStageGroups: { key: string; label: string; statuses: ProductStatus[] }[] = [
  { key: "cutting", label: "下料中", statuses: ["PENDING", "CUTTING"] },
  { key: "welding", label: "焊接中", statuses: ["WELDING"] },
  { key: "polishing", label: "抛光中", statuses: ["POLISHING"] },
  { key: "wait-outsource", label: "待外发", statuses: ["WAIT_OUTSOURCE"] },
  { key: "outsourcing", label: "外发中", statuses: ["OUTSOURCING"] },
  { key: "partial-return", label: "部分回厂", statuses: ["PARTIAL_RETURN"] },
  { key: "returned", label: "已回厂", statuses: ["RETURNED"] },
  { key: "wait-delivery", label: "待送货", statuses: ["WAIT_DELIVERY"] },
  { key: "partial-delivered", label: "部分送货", statuses: ["PARTIAL_DELIVERED"] },
  { key: "completed", label: "已完成", statuses: ["COMPLETED"] },
  { key: "abnormal", label: "异常", statuses: ["ABNORMAL"] }
];

export function isProductStatus(value: string): value is ProductStatus {
  return value in productStatusLabels;
}

export function getProductStatusLabel(status: string) {
  return productStatusLabels[status as ProductStatus] ?? status;
}
