export type ReturnItemStatusInput = {
  outsourceQuantity: number;
  returnedQuantity: number;
  hasAbnormal: boolean;
};

export function resolveOutsourceItemStatus(item: ReturnItemStatusInput) {
  if (item.hasAbnormal) return "ABNORMAL";
  if (item.returnedQuantity <= 0) return "OUTSOURCED";
  if (item.returnedQuantity < item.outsourceQuantity) return "PARTIAL_RETURN";
  return "RETURNED";
}

export type PartStatusInput = {
  outsourcedQuantity: number;
  returnedQuantity: number;
  hasAbnormal: boolean;
};

export function resolvePartStatus(part: PartStatusInput) {
  if (part.hasAbnormal) return "ABNORMAL";
  if (part.returnedQuantity <= 0 && part.outsourcedQuantity > 0) return "OUTSOURCING";
  if (part.returnedQuantity > 0 && part.returnedQuantity < part.outsourcedQuantity) return "PARTIAL_RETURN";
  if (part.returnedQuantity >= part.outsourcedQuantity && part.outsourcedQuantity > 0) return "RETURNED";
  return "PENDING";
}

export function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
