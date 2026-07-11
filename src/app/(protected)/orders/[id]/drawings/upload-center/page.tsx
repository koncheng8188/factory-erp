import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { UploadCenterManager } from "./upload-center-manager";

export const dynamic = "force-dynamic";

type UploadCenterPageProps = {
  params: Promise<{ id: string }>;
};

export default async function UploadCenterPage({ params }: UploadCenterPageProps) {
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id }, { orderNo: id }]
    },
    include: {
      customer: true,
      products: {
        orderBy: { createdAt: "desc" },
        include: {
          parts: {
            orderBy: { createdAt: "desc" },
            include: {
              _count: {
                select: { drawings: true }
              }
            }
          }
        }
      }
    }
  });

  if (!order) {
    notFound();
  }

  const uploadOrder = {
    id: order.id,
    orderNo: order.orderNo,
    customerName: order.customerName || order.customer.name,
    products: order.products.map((product) => ({
      id: product.id,
      productName: product.productName,
      specification: product.specification,
      material: product.material,
      quantity: product.quantity,
      parts: product.parts.map((part) => ({
        id: part.id,
        productId: part.productId,
        productName: product.productName,
        partName: part.partName,
        partCode: part.partCode,
        specification: part.specification,
        material: part.material,
        existingDrawingCount: part._count.drawings
      }))
    }))
  };

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href={`/orders/${order.id}`}>
          返回订单详情
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">图纸上传中心</h1>
        <p className="mt-1 text-sm text-[#667085]">
          订单号：{order.orderNo}　客户：{uploadOrder.customerName}
        </p>
      </div>

      <UploadCenterManager order={uploadOrder} />
    </div>
  );
}
