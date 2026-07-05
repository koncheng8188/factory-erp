import { prisma } from "@/lib/prisma";
import { OutsourcingManager } from "./outsourcing-manager";

export const dynamic = "force-dynamic";

export default async function OutsourcingPage() {
  const outsourceOrders = await prisma.outsourceOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { items: true } }
    }
  });

  return (
    <OutsourcingManager
      outsourceOrders={outsourceOrders.map((order) => ({
        id: order.id,
        outsourceNo: order.outsourceNo,
        supplierName: order.supplierName,
        outsourceType: order.outsourceType,
        outsourceDate: order.outsourceDate.toISOString(),
        expectedReturnDate: order.expectedReturnDate?.toISOString() ?? null,
        status: order.status,
        handler: order.handler,
        remark: order.remark,
        itemCount: order._count.items
      }))}
    />
  );
}
