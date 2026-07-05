import { prisma } from "@/lib/prisma";
import { OrderManager } from "./order-manager";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [orders, customers] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { products: true } } }
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } })
  ]);

  return <OrderManager orders={orders} customers={customers} />;
}
