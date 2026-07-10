import type { UserRole } from "@prisma/client";

export const userRoleLabels: Record<UserRole, string> = {
  ADMIN: "管理员",
  OWNER: "老板",
  SALES: "业务",
  PRODUCTION: "生产",
  OUTSOURCE: "外发",
  DELIVERY: "送货"
};
