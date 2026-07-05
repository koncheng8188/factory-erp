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
        products: { orderBy: { createdAt: "desc" } }
      }
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } })
  ]);

  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/orders">
          返回订单列表
        </Link>
      </div>
      <OrderDetailManager order={order} customers={customers} />
    </div>
  );
}
