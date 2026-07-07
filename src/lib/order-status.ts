import type { OrderStatus } from "@prisma/client";

export const orderStatusOptions: { value: OrderStatus; label: string }[] = [
  { value: "PENDING", label: "待处理" },
  { value: "PRODUCING", label: "生产中" },
  { value: "OUTSOURCING", label: "外发中" },
  { value: "WAIT_DELIVERY", label: "待送货" },
  { value: "PARTIAL_DELIVERED", label: "部分送货" },
  { value: "COMPLETED", label: "已完成" },
  { value: "ABNORMAL", label: "异常" }
];

export const orderStatusLabels = Object.fromEntries(
  orderStatusOptions.map((option) => [option.value, option.label])
) as Record<OrderStatus, string>;

export function isOrderStatus(value: string): value is OrderStatus {
  return value in orderStatusLabels;
}

export function getOrderStatusLabel(status: string) {
  return orderStatusLabels[status as OrderStatus] ?? status;
}
