import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
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
            parts: { orderBy: { createdAt: "desc" } }
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
        remark: part.remark
      }))
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
