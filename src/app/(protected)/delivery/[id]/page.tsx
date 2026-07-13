import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { formatDisplayDate } from "@/lib/delivery";
import { getDeliveryStatusLabel } from "@/lib/delivery-status";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type DeliveryDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DeliveryDetailPage({ params }: DeliveryDetailPageProps) {
  const user = await requirePagePermission("delivery.view");
  const canPrintDelivery = hasPermission(user.role, "delivery.print", []);

  const { id } = await params;
  const deliveryOrder = await prisma.deliveryOrder.findFirst({
    where: {
      OR: [{ id }, { deliveryNo: id }]
    },
    include: {
      order: {
        select: {
          orderNo: true
        }
      },
      items: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!deliveryOrder) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#d8dde6] bg-white px-4 py-3">
        <Link className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50" href="/delivery">
          返回送货列表
        </Link>
        <Link className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100" href={`/orders/${deliveryOrder.orderId}`}>
          查看关联订单
        </Link>
        {canPrintDelivery ? (
          <Link
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white !text-white shadow-sm hover:bg-slate-700 hover:text-white hover:!text-white focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            href={`/delivery/${deliveryOrder.id}/print`}
            style={{ color: "#ffffff" }}
          >
            打印送货单
          </Link>
        ) : null}
      </div>

      <section>
        <h1 className="text-2xl font-semibold">送货单详情：{deliveryOrder.deliveryNo}</h1>
        <p className="mt-2 text-sm text-[#667085]">查看送货单基本信息和本次送货明细。</p>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">送货单基本信息</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[#667085]">送货单号</dt><dd className="mt-1 font-medium">{deliveryOrder.deliveryNo}</dd></div>
          <div><dt className="text-[#667085]">客户名称</dt><dd className="mt-1 font-medium">{deliveryOrder.customerName}</dd></div>
          <div><dt className="text-[#667085]">订单号</dt><dd className="mt-1">{deliveryOrder.order.orderNo}</dd></div>
          <div><dt className="text-[#667085]">送货日期</dt><dd className="mt-1">{formatDisplayDate(deliveryOrder.deliveryDate)}</dd></div>
          <div><dt className="text-[#667085]">收货人</dt><dd className="mt-1">{deliveryOrder.receiver || "-"}</dd></div>
          <div><dt className="text-[#667085]">经手人</dt><dd className="mt-1">{deliveryOrder.handler || "-"}</dd></div>
          <div><dt className="text-[#667085]">状态</dt><dd className="mt-1">{getDeliveryStatusLabel(deliveryOrder.status)}</dd></div>
          <div><dt className="text-[#667085]">创建时间</dt><dd className="mt-1">{formatDisplayDate(deliveryOrder.createdAt)}</dd></div>
          <div className="sm:col-span-2 lg:col-span-4"><dt className="text-[#667085]">备注</dt><dd className="mt-1">{deliveryOrder.remark || "-"}</dd></div>
        </dl>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">送货明细</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">规格</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">本次送货数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
              </tr>
            </thead>
            <tbody>
              {deliveryOrder.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{item.productName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.specification || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.deliveryQuantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.remark || "-"}</td>
                </tr>
              ))}
              {deliveryOrder.items.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={4}>该送货单暂无明细。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
