import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canDeliverProduct, deliveredQuantityFromItems, missingDeliveryQuantity } from "@/lib/delivery";
import { DeliveryCreateManager } from "./delivery-create-manager";

export const dynamic = "force-dynamic";

type NewDeliveryPageProps = {
  searchParams: Promise<{ orderId?: string }>;
};

export default async function NewDeliveryPage({ searchParams }: NewDeliveryPageProps) {
  const { orderId } = await searchParams;
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      products: {
        orderBy: { createdAt: "desc" },
        include: {
          deliveryOrderItems: {
            select: {
              deliveryQuantity: true
            }
          }
        }
      }
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/delivery">
          返回送货单列表
        </Link>
      </div>
      <DeliveryCreateManager
        initialOrderId={orderId ?? ""}
        orders={orders.map((order) => ({
          id: order.id,
          orderNo: order.orderNo,
          customerName: order.customerName,
          products: order.products.map((product) => {
            const deliveredQuantity = deliveredQuantityFromItems(product.deliveryOrderItems);
            const missingQuantity = missingDeliveryQuantity(product.quantity, deliveredQuantity);
            return {
              id: product.id,
              productName: product.productName,
              specification: product.specification,
              material: product.material,
              quantity: product.quantity,
              status: product.status,
              deliveredQuantity,
              missingQuantity,
              canDeliver: canDeliverProduct(product.status, missingQuantity)
            };
          })
        }))}
      />
    </div>
  );
}
