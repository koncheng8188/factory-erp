import { prisma } from "@/lib/prisma";
import { CustomerManager } from "./customer-manager";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true } } }
  });

  return <CustomerManager customers={customers} />;
}
