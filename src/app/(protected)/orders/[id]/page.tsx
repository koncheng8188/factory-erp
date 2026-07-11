import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { withProtectedDrawingUrls } from "@/lib/drawing-file-url";
import { OrderDetailManager } from "./order-detail-manager";

export const dynamic = "force-dynamic";

type OrderDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const [order, customers] = await Promise.all([
    prisma.order.findFirst({
      where: {
        OR: [{ id }, { orderNo: id }]
      },
      include: {
        customer: true,
        products: {
          orderBy: { createdAt: "desc" },
          include: {
            deliveryOrderItems: {
              select: {
                deliveryQuantity: true
              }
            },
            parts: {
              orderBy: { createdAt: "desc" },
              include: {
                drawings: {
                  orderBy: [{ isMain: "desc" }, { version: "desc" }, { createdAt: "desc" }]
                },
                outsourceItems: {
                  select: {
                    outsourceQuantity: true,
                    returnedQuantity: true,
                    missingQuantity: true,
                    status: true
                  }
                },
                outsourceReturnItems: {
                  select: {
                    returnQuantity: true,
                    abnormalQuantity: true
                  }
                },
                abnormals: {
                  select: {
                    id: true,
                    status: true,
                    reason: true,
                    createdAt: true,
                    resolvedAt: true
                  },
                  orderBy: { createdAt: "desc" }
                }
              }
            }
          }
        },
        deliveryOrders: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            deliveryNo: true,
            deliveryDate: true,
            status: true,
            receiver: true,
            createdAt: true,
            items: {
              select: {
                deliveryQuantity: true,
                productId: true
              }
            }
          }
        },
        partAbnormals: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            reason: true,
            createdAt: true,
            resolvedAt: true,
            productPartId: true,
            productId: true
          }
        }
      }
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } })
  ]);

  if (!order) {
    notFound();
  }

  const orderDetail = {
    id: order.id,
    orderNo: order.orderNo,
    customerId: order.customerId,
    customerName: order.customerName,
    orderDate: order.orderDate.toISOString(),
    deliveryDate: order.deliveryDate?.toISOString() ?? null,
    status: order.status,
    remark: order.remark,
    customer: {
      id: order.customer.id,
      name: order.customer.name,
      contact: order.customer.contact,
      phone: order.customer.phone,
      address: order.customer.address
    },
    products: order.products.map((product) => ({
      id: product.id,
      productName: product.productName,
      specification: product.specification,
      material: product.material,
      quantity: product.quantity,
      surfaceTreatment: product.surfaceTreatment,
      status: product.status,
      remark: product.remark,
      deliveryOrderItems: product.deliveryOrderItems.map((item) => ({
        deliveryQuantity: item.deliveryQuantity
      })),
      parts: product.parts.map((part) => ({
        id: part.id,
        partName: part.partName,
        partCode: part.partCode,
        specification: part.specification,
        material: part.material,
        unitQuantity: part.unitQuantity,
        productQuantity: part.productQuantity,
        totalQuantity: part.totalQuantity,
        surfaceTreatment: part.surfaceTreatment,
        color: part.color,
        outsourcedQuantity: part.outsourcedQuantity,
        returnedQuantity: part.returnedQuantity,
        missingQuantity: part.missingQuantity,
        status: part.status,
        remark: part.remark,
        drawings: part.drawings.map((drawing) => ({
          ...withProtectedDrawingUrls(drawing),
          fileName: drawing.fileName,
          fileType: drawing.fileType,
          version: drawing.version,
          isMain: drawing.isMain,
          status: drawing.status,
          uploadStatus: drawing.uploadStatus,
          errorMessage: drawing.errorMessage,
          remark: drawing.remark
        })),
        outsourceItems: part.outsourceItems.map((item) => ({
          outsourceQuantity: item.outsourceQuantity,
          returnedQuantity: item.returnedQuantity,
          missingQuantity: item.missingQuantity,
          status: item.status
        })),
        outsourceReturnItems: part.outsourceReturnItems.map((item) => ({
          returnQuantity: item.returnQuantity,
          abnormalQuantity: item.abnormalQuantity
        })),
        abnormals: part.abnormals.map((abnormal) => ({
          id: abnormal.id,
          status: abnormal.status,
          reason: abnormal.reason,
          createdAt: abnormal.createdAt.toISOString(),
          resolvedAt: abnormal.resolvedAt?.toISOString() ?? null
        }))
      }))
    })),
    deliveryOrders: order.deliveryOrders.map((deliveryOrder) => ({
      id: deliveryOrder.id,
      deliveryNo: deliveryOrder.deliveryNo,
      deliveryDate: deliveryOrder.deliveryDate.toISOString(),
      status: deliveryOrder.status,
      receiver: deliveryOrder.receiver,
      createdAt: deliveryOrder.createdAt.toISOString(),
      items: deliveryOrder.items.map((item) => ({
        deliveryQuantity: item.deliveryQuantity,
        productId: item.productId
      }))
    })),
    partAbnormals: order.partAbnormals.map((abnormal) => ({
      id: abnormal.id,
      status: abnormal.status,
      reason: abnormal.reason,
      createdAt: abnormal.createdAt.toISOString(),
      resolvedAt: abnormal.resolvedAt?.toISOString() ?? null,
      productPartId: abnormal.productPartId,
      productId: abnormal.productId
    }))
  };

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/orders">
          返回订单列表
        </Link>
      </div>
      <OrderDetailManager order={orderDetail} customers={customers} />
    </div>
  );
}
