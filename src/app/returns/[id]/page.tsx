import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDisplayDate, outsourceTypeLabels, type OutsourceTypeValue } from "@/lib/outsource";

export const dynamic = "force-dynamic";

type ReturnDetailPageProps = {
  params: Promise<{ id: string }>;
};

function typeLabel(type: string) {
  return outsourceTypeLabels[type as OutsourceTypeValue] ?? type;
}

export default async function ReturnDetailPage({ params }: ReturnDetailPageProps) {
  const { id } = await params;
  const returnOrder = await prisma.outsourceReturn.findUnique({
    where: { id },
    include: {
      outsourceOrder: true,
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          outsourceOrderItem: {
            include: {
              order: {
                select: {
                  orderNo: true
                }
              },
              part: {
                select: {
                  partCode: true,
                  specification: true,
                  material: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!returnOrder) {
    notFound();
  }

  const totalReturnQuantity = returnOrder.items.reduce((sum, item) => sum + item.returnQuantity, 0);
  const totalAbnormalQuantity = returnOrder.items.reduce((sum, item) => sum + item.abnormalQuantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/returns">
          返回回厂记录列表
        </Link>
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href={`/outsourcing/${returnOrder.outsourceOrder.id}`}>
          查看外发单
        </Link>
      </div>

      <section>
        <h1 className="text-2xl font-semibold">回厂记录详情</h1>
        <p className="mt-2 text-sm text-[#667085]">查看本次回厂登记的主记录和明细。</p>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">回厂信息</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[#667085]">回厂日期</dt><dd className="mt-1 font-medium">{formatDisplayDate(returnOrder.returnDate)}</dd></div>
          <div><dt className="text-[#667085]">外发单号</dt><dd className="mt-1 font-medium">{returnOrder.outsourceOrder.outsourceNo}</dd></div>
          <div><dt className="text-[#667085]">外发厂家</dt><dd className="mt-1">{returnOrder.outsourceOrder.supplierName}</dd></div>
          <div><dt className="text-[#667085]">外发类型</dt><dd className="mt-1">{typeLabel(returnOrder.outsourceOrder.outsourceType)}</dd></div>
          <div><dt className="text-[#667085]">外发单状态</dt><dd className="mt-1">{returnOrder.outsourceOrder.status}</dd></div>
          <div><dt className="text-[#667085]">经手人</dt><dd className="mt-1">{returnOrder.handler || "-"}</dd></div>
          <div><dt className="text-[#667085]">回厂数量</dt><dd className="mt-1">{totalReturnQuantity}</dd></div>
          <div><dt className="text-[#667085]">异常数量</dt><dd className="mt-1">{totalAbnormalQuantity}</dd></div>
          <div className="sm:col-span-2 lg:col-span-4"><dt className="text-[#667085]">备注</dt><dd className="mt-1">{returnOrder.remark || "-"}</dd></div>
        </dl>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">回厂明细</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件编号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">规格</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">材质</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">表面处理</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">颜色</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">本次回来数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">异常数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">异常原因</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
              </tr>
            </thead>
            <tbody>
              {returnOrder.items.map((item) => {
                const outsourceItem = item.outsourceOrderItem;
                return (
                  <tr key={item.id} className="align-top">
                    <td className="border-b border-[#eef2f6] px-3 py-3">{outsourceItem.order.orderNo}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{outsourceItem.productName}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{outsourceItem.partName}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{outsourceItem.part.partCode || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{outsourceItem.part.specification || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{outsourceItem.part.material || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{outsourceItem.surfaceTreatment || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{outsourceItem.color || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.returnQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.abnormalQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.abnormalReason || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.remark || "-"}</td>
                  </tr>
                );
              })}
              {returnOrder.items.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={12}>该回厂记录暂无明细。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
