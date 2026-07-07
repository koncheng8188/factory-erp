import type { DeliveryOrderStatus } from "@prisma/client";

export const deliveryStatusOptions: { value: DeliveryOrderStatus; label: string }[] = [
  { value: "DRAFT", label: "草稿" },
  { value: "DELIVERED", label: "已送货" },
  { value: "PARTIAL_DELIVERED", label: "部分送货" },
  { value: "COMPLETED", label: "已完成" }
];

export const deliveryStatusLabels = Object.fromEntries(
  deliveryStatusOptions.map((option) => [option.value, option.label])
) as Record<DeliveryOrderStatus, string>;

export function isDeliveryStatus(value: string): value is DeliveryOrderStatus {
  return value in deliveryStatusLabels;
}

export function getDeliveryStatusLabel(status: string) {
  return deliveryStatusLabels[status as DeliveryOrderStatus] ?? status;
}
