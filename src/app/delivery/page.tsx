import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDisplayDate } from "@/lib/delivery";

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const deliveryOrders = await prisma.deliveryOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      order: {
        select: {
          orderNo: true
        }
      }
    }
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">送货管理</h1>
          <p className="mt-2 text-sm text-[#667085]">查看送货单记录，支持按订单分批创建送货单。</p>
        </div>
        <Link
          href="/delivery/new"
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold !text-white hover:bg-slate-700 hover:!text-white"
          style={{ color: "#ffffff" }}
        >
          新建送货单
        </Link>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">送货单列表</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">送货单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">客户名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">送货日期</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">收货人</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">经手人</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {deliveryOrders.map((deliveryOrder) => (
                <tr key={deliveryOrder.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{deliveryOrder.deliveryNo}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{deliveryOrder.customerName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{deliveryOrder.order.orderNo}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{formatDisplayDate(deliveryOrder.deliveryDate)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{deliveryOrder.receiver || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{deliveryOrder.handler || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{deliveryOrder.status}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{deliveryOrder.remark || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={`/delivery/${deliveryOrder.id}`}>
                      查看详情
                    </Link>
                  </td>
                </tr>
              ))}
              {deliveryOrders.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={9}>暂无送货单，请先新建送货单。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
