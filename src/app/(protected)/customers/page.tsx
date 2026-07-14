import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/authorization";
import { hasPermission } from "@/lib/permissions";
import { CustomerManager } from "./customer-manager";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await requirePagePermission("customer.view");
  const canCreateCustomer =
    hasPermission(user.role, "customer.view", []) && hasPermission(user.role, "customer.create", []);
  const canUpdateCustomer =
    hasPermission(user.role, "customer.view", []) && hasPermission(user.role, "customer.update", []);
  const canDeleteCustomer =
    hasPermission(user.role, "customer.view", []) && hasPermission(user.role, "customer.delete", []);

  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true } } }
  });

  return (
    <CustomerManager
      customers={customers}
      canCreateCustomer={canCreateCustomer}
      canUpdateCustomer={canUpdateCustomer}
      canDeleteCustomer={canDeleteCustomer}
    />
  );
}
