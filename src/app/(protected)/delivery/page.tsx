import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { formatDisplayDate } from "@/lib/delivery";
import { deliveryStatusOptions, getDeliveryStatusLabel, isDeliveryStatus } from "@/lib/delivery-status";

export const dynamic = "force-dynamic";

type DeliveryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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

export default async function DeliveryPage({ searchParams }: DeliveryPageProps) {
  await requirePagePermission("delivery.view");

  const params = await searchParams;
  const keyword = firstQueryValue(params?.keyword).trim();
  const rawStatus = firstQueryValue(params?.status).trim();
  const customer = firstQueryValue(params?.customer).trim();
  const receiver = firstQueryValue(params?.receiver).trim();
  const startDate = firstQueryValue(params?.startDate).trim();
  const endDate = firstQueryValue(params?.endDate).trim();
  const status = isDeliveryStatus(rawStatus) ? rawStatus : "";
  const parsedStartDate = parseDateFilter(startDate);
  const parsedEndDate = parseDateFilter(endDate);
  const andConditions: Prisma.DeliveryOrderWhereInput[] = [];

  if (keyword) {
    andConditions.push({
      OR: [
        { deliveryNo: { contains: keyword } },
        { order: { orderNo: { contains: keyword } } },
        { customerName: { contains: keyword } },
        { receiver: { contains: keyword } },
        { handler: { contains: keyword } },
        { items: { some: { productName: { contains: keyword } } } }
      ]
    });
  }

  if (status) {
    andConditions.push({ status });
  }

  if (customer) {
    andConditions.push({ customerName: { contains: customer } });
  }

  if (receiver) {
    andConditions.push({ receiver: { contains: receiver } });
  }

  if (parsedStartDate || parsedEndDate) {
    andConditions.push({
      deliveryDate: {
        ...(parsedStartDate ? { gte: parsedStartDate } : {}),
        ...(parsedEndDate ? { lt: nextDate(parsedEndDate) } : {})
      }
    });
  }

  const where: Prisma.DeliveryOrderWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

  const deliveryOrders = await prisma.deliveryOrder.findMany({
    where,
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
        <form action="/delivery" className="mt-4 rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-6">
            <label className="block text-sm font-medium md:col-span-2">
              关键词
              <input
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                name="keyword"
                placeholder="搜索送货单号、订单号、客户、收货人、经手人、产品"
                defaultValue={keyword}
              />
            </label>
            <label className="block text-sm font-medium">
              送货状态
              <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" name="status" defaultValue={status}>
                <option value="">全部状态</option>
                {deliveryStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              客户名称
              <input
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                name="customer"
                placeholder="客户名称"
                defaultValue={customer}
              />
            </label>
            <label className="block text-sm font-medium">
              收货人
              <input
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                name="receiver"
                placeholder="收货人"
                defaultValue={receiver}
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
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white">
              搜索
            </button>
            <Link className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium" href="/delivery">
              清空筛选
            </Link>
          </div>
        </form>
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
                  <td className="border-b border-[#eef2f6] px-3 py-3">{getDeliveryStatusLabel(deliveryOrder.status)}</td>
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
