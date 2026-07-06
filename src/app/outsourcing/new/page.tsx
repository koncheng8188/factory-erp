import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { pickOutsourceDrawing } from "@/lib/outsource";
import { OutsourceCreateManager } from "./outsource-create-manager";

export const dynamic = "force-dynamic";

export default async function NewOutsourceOrderPage() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      products: {
        orderBy: { createdAt: "desc" },
        include: {
          parts: {
            orderBy: { createdAt: "desc" },
            include: {
              drawings: {
                orderBy: [{ isMain: "desc" }, { version: "desc" }, { createdAt: "desc" }]
              }
            }
          }
        }
      }
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/outsourcing">
          返回外发单列表
        </Link>
      </div>
      <OutsourceCreateManager
        orders={orders.map((order) => ({
          id: order.id,
          orderNo: order.orderNo,
          customerName: order.customerName,
          products: order.products.map((product) => ({
            id: product.id,
            productName: product.productName,
            status: product.status,
            specification: product.specification,
            material: product.material,
            quantity: product.quantity,
            parts: product.parts.map((part) => {
              const drawing = pickOutsourceDrawing(part.drawings);
              return {
                id: part.id,
                orderId: part.orderId,
                orderNo: order.orderNo,
                productId: product.id,
                productName: product.productName,
                partName: part.partName,
                partCode: part.partCode,
                specification: part.specification,
                material: part.material,
                surfaceTreatment: part.surfaceTreatment,
                color: part.color,
                totalQuantity: part.totalQuantity,
                outsourcedQuantity: part.outsourcedQuantity,
                returnedQuantity: part.returnedQuantity,
                status: part.status,
                drawing: drawing
                  ? {
                      id: drawing.id,
                      thumbnailUrl: drawing.thumbnailUrl ?? drawing.printThumbnailUrl,
                      originalUrl: drawing.originalUrl,
                      fileType: drawing.fileType
                    }
                  : null
              };
            })
          }))
        }))}
      />
    </div>
  );
}
