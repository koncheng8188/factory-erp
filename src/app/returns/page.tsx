import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDisplayDate, outsourceTypeLabels, type OutsourceTypeValue } from "@/lib/outsource";

export const dynamic = "force-dynamic";

type ReturnsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function typeLabel(type: string) {
  return outsourceTypeLabels[type as OutsourceTypeValue] ?? type;
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseDateFilter(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nextDate(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

export default async function ReturnsPage({ searchParams }: ReturnsPageProps) {
  const params = await searchParams;
  const keyword = firstQueryValue(params?.keyword).trim();
  const supplier = firstQueryValue(params?.supplier).trim();
  const startDate = firstQueryValue(params?.startDate).trim();
  const endDate = firstQueryValue(params?.endDate).trim();
  const abnormal = firstQueryValue(params?.abnormal).trim() === "1";
  const parsedStartDate = parseDateFilter(startDate);
  const parsedEndDate = parseDateFilter(endDate);
  const andConditions: Prisma.OutsourceReturnWhereInput[] = [];

  if (keyword) {
    andConditions.push({
      OR: [
        { id: { contains: keyword } },
        { outsourceOrder: { outsourceNo: { contains: keyword } } },
        { outsourceOrder: { supplierName: { contains: keyword } } },
        { handler: { contains: keyword } },
        { items: { some: { outsourceOrderItem: { order: { orderNo: { contains: keyword } } } } } },
        { items: { some: { outsourceOrderItem: { order: { customerName: { contains: keyword } } } } } },
        { items: { some: { outsourceOrderItem: { productName: { contains: keyword } } } } },
        { items: { some: { outsourceOrderItem: { partName: { contains: keyword } } } } }
      ]
    });
  }

  if (supplier) {
    andConditions.push({ outsourceOrder: { supplierName: { contains: supplier } } });
  }

  if (parsedStartDate || parsedEndDate) {
    andConditions.push({
      returnDate: {
        ...(parsedStartDate ? { gte: parsedStartDate } : {}),
        ...(parsedEndDate ? { lt: nextDate(parsedEndDate) } : {})
      }
    });
  }

  if (abnormal) {
    andConditions.push({ items: { some: { abnormalQuantity: { gt: 0 } } } });
  }

  const where: Prisma.OutsourceReturnWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

  const returns = await prisma.outsourceReturn.findMany({
    where,
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
        <form action="/returns" className="mt-4 rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-6">
            <label className="block text-sm font-medium md:col-span-2">
              关键词
              <input
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                name="keyword"
                placeholder="搜索回厂记录ID、外发单号、厂家、经手人、订单、客户、产品、部件"
                defaultValue={keyword}
              />
            </label>
            <label className="block text-sm font-medium">
              外发厂家
              <input
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                name="supplier"
                placeholder="外发厂家"
                defaultValue={supplier}
              />
            </label>
            <label className="block text-sm font-medium">
              开始日期
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                name="startDate"
                defaultValue={parsedStartDate ? startDate : ""}
              />
            </label>
            <label className="block text-sm font-medium">
              结束日期
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                name="endDate"
                defaultValue={parsedEndDate ? endDate : ""}
              />
            </label>
            <label className="flex items-end gap-2 text-sm font-medium">
              <input type="checkbox" className="mb-3 h-4 w-4 rounded border-[#cfd6e1]" name="abnormal" value="1" defaultChecked={abnormal} />
              <span className="mb-2">只看异常回厂</span>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white">
              搜索
            </button>
            <Link className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium" href="/returns">
              清空筛选
            </Link>
          </div>
        </form>
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
                    <td className="border-b border-[#eef2f6] px-3 py-3">
                      {totalAbnormalQuantity > 0 ? <span className="font-medium text-red-700">异常：{totalAbnormalQuantity} 件</span> : totalAbnormalQuantity}
                    </td>
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
