import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDrawingOriginalUrl, getDrawingThumbnailUrl } from "@/lib/drawing-file-url";
import { pickOutsourceDrawing } from "@/lib/outsource";
import { requirePagePermission } from "@/lib/auth/authorization";
import { hasPermission } from "@/lib/permissions";
import { OutsourceCreateManager } from "./outsource-create-manager";

export const dynamic = "force-dynamic";

function buildSuggestions(values: Array<string | null | undefined>) {
  const suggestions: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const suggestion = value?.trim();
    if (!suggestion || seen.has(suggestion)) continue;

    seen.add(suggestion);
    suggestions.push(suggestion);

    if (suggestions.length >= 30) break;
  }

  return suggestions;
}

export default async function NewOutsourceOrderPage() {
  const user = await requirePagePermission("outsource.view");
  const canCreateOutsourceOrder =
    hasPermission(user.role, "order.view", []) &&
    hasPermission(user.role, "product.view", []) &&
    hasPermission(user.role, "part.view", []) &&
    hasPermission(user.role, "drawing.view", []) &&
    hasPermission(user.role, "outsource.view", []) &&
    hasPermission(user.role, "outsource.create", []);

  if (!canCreateOutsourceOrder) {
    return (
      <div className="space-y-6">
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/outsourcing">
          返回外发单列表
        </Link>
        <section className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          没有创建外发单的权限。
        </section>
      </div>
    );
  }

  const [orders, outsourceOrders] = await Promise.all([
    prisma.order.findMany({
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
    }),
    prisma.outsourceOrder.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        supplierName: true,
        handler: true
      }
    })
  ]);

  const supplierSuggestions = buildSuggestions(outsourceOrders.map((order) => order.supplierName));
  const handlerSuggestions = buildSuggestions(outsourceOrders.map((order) => order.handler));

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/outsourcing">
          返回外发单列表
        </Link>
      </div>
      <OutsourceCreateManager
        canCreateOutsourceOrder={canCreateOutsourceOrder}
        supplierSuggestions={supplierSuggestions}
        handlerSuggestions={handlerSuggestions}
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
                      thumbnailUrl: drawing.thumbnailUrl || drawing.printThumbnailUrl ? getDrawingThumbnailUrl(drawing.id) : null,
                      originalUrl: getDrawingOriginalUrl(drawing.id),
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
