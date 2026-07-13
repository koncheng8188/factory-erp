import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/authorization";
import { CustomerManager } from "./customer-manager";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requirePagePermission("customer.view");

  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true } } }
  });

  return <CustomerManager customers={customers} />;
}
