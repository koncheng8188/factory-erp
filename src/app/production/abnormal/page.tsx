import Link from "next/link";
import { getProductPartStatusLabel } from "@/lib/product-part-status";
import { prisma } from "@/lib/prisma";
import { AbnormalResolveActions } from "./abnormal-resolve-actions";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date | null) {
  if (!value) return "-";
  return value.toLocaleString("zh-CN", { hour12: false });
}

function displayValue(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function abnormalStatusLabel(status: string) {
  if (status === "OPEN") return "未处理";
  if (status === "RESOLVED") return "已处理";
  return status;
}

export default async function ProductionAbnormalPage() {
  const abnormals = await prisma.productPartAbnormal.findMany({
    orderBy: [
      { status: "asc" },
      { createdAt: "desc" }
    ],
    include: {
      order: {
        include: {
          customer: true
        }
      },
      product: true,
      productPart: true
    }
  });

  const openCount = abnormals.filter((abnormal) => abnormal.status === "OPEN").length;
  const resolvedCount = abnormals.length - openCount;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">生产异常列表</h1>
          <p className="mt-2 text-sm text-[#667085]">查看生产异常原因，处理完成后恢复部件生产阶段。</p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-lg border border-[#cfd6e1] px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f6f7f9]"
          href="/production"
        >
          返回生产进度
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm">
          <div className="text-sm font-medium text-[#667085]">异常总数</div>
          <div className="mt-2 text-2xl font-semibold text-[#172033]">{abnormals.length}</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="text-sm font-medium text-red-700">未处理异常</div>
          <div className="mt-2 text-2xl font-semibold text-red-700">{openCount}</div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 shadow-sm">
          <div className="text-sm font-medium text-green-700">已处理异常</div>
          <div className="mt-2 text-2xl font-semibold text-green-700">{resolvedCount}</div>
        </div>
      </section>

      <section className="rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">异常时间</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">客户</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件编号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">异常原因</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">原状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">当前部件状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">处理状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">处理时间</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">处理备注</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {abnormals.map((abnormal) => (
                <tr key={abnormal.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3">{formatDateTime(abnormal.createdAt)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{abnormal.order.orderNo}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{abnormal.order.customer.name || abnormal.order.customerName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{abnormal.product.productName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{displayValue(abnormal.productPart.partCode)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{abnormal.productPart.partName}</td>
                  <td className="max-w-xs border-b border-[#eef2f6] px-3 py-3">{abnormal.reason}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{getProductPartStatusLabel(abnormal.fromStatus)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{getProductPartStatusLabel(abnormal.productPart.status)}</td>
                  <td className={abnormal.status === "OPEN" ? "border-b border-[#eef2f6] px-3 py-3 font-semibold text-red-700" : "border-b border-[#eef2f6] px-3 py-3 font-semibold text-green-700"}>
                    {abnormalStatusLabel(abnormal.status)}
                  </td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{formatDateTime(abnormal.resolvedAt)}</td>
                  <td className="max-w-xs border-b border-[#eef2f6] px-3 py-3">{displayValue(abnormal.resolvedRemark)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    {abnormal.status === "OPEN" ? (
                      <AbnormalResolveActions productPartId={abnormal.productPartId} fromStatus={abnormal.fromStatus} />
                    ) : (
                      <span className="text-sm text-[#667085]">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {abnormals.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-[#667085]" colSpan={13}>
                    暂无生产异常记录。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
