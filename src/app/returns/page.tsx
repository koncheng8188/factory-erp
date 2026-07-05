import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDisplayDate, outsourceTypeLabels, type OutsourceTypeValue } from "@/lib/outsource";

export const dynamic = "force-dynamic";

function typeLabel(type: string) {
  return outsourceTypeLabels[type as OutsourceTypeValue] ?? type;
}

export default async function ReturnsPage() {
  const returns = await prisma.outsourceReturn.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      outsourceOrder: {
        select: {
          id: true,
          outsourceNo: true,
          supplierName: true,
          outsourceType: true,
          status: true
        }
      },
      items: {
        select: {
          returnQuantity: true,
          abnormalQuantity: true
        }
      }
    }
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">回厂登记</h1>
          <p className="mt-2 text-sm text-[#667085]">查看外发部件分批回厂记录，登记入口在外发单详情页。</p>
        </div>
        <Link
          href="/outsourcing"
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold !text-white hover:bg-slate-700 hover:!text-white"
          style={{ color: "#ffffff" }}
        >
          选择外发单登记
        </Link>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">回厂记录列表</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">回厂日期</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">外发单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">外发厂家</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">外发类型</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">外发单状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">经手人</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">明细数</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">回厂数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">异常数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((returnOrder) => {
                const totalReturnQuantity = returnOrder.items.reduce((sum, item) => sum + item.returnQuantity, 0);
                const totalAbnormalQuantity = returnOrder.items.reduce((sum, item) => sum + item.abnormalQuantity, 0);
                return (
                  <tr key={returnOrder.id} className="align-top">
                    <td className="border-b border-[#eef2f6] px-3 py-3">{formatDisplayDate(returnOrder.returnDate)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{returnOrder.outsourceOrder.outsourceNo}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{returnOrder.outsourceOrder.supplierName}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{typeLabel(returnOrder.outsourceOrder.outsourceType)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{returnOrder.outsourceOrder.status}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{returnOrder.handler || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{returnOrder.items.length}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{totalReturnQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{totalAbnormalQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={`/returns/${returnOrder.id}`}>
                          详情
                        </Link>
                        <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={`/outsourcing/${returnOrder.outsourceOrder.id}`}>
                          外发单
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {returns.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={10}>暂无回厂记录，请先从外发单详情页登记。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
