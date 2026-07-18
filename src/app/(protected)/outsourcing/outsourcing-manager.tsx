"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDisplayDate, outsourceTypeLabels, outsourceTypeOptions, type OutsourceTypeValue } from "@/lib/outsource";
import { getOutsourceStatusLabel, outsourceStatusOptions } from "@/lib/outsource-status";

type OutsourceOrderListItem = {
  id: string;
  outsourceNo: string;
  supplierName: string;
  outsourceType: string;
  outsourceDate: string;
  expectedReturnDate: string | null;
  status: string;
  handler: string | null;
  remark: string | null;
  itemCount: number;
};

type OutsourceFilters = {
  keyword: string;
  status: string;
  type: string;
  supplier: string;
  startDate: string;
  endDate: string;
  overdue: boolean;
};

function typeLabel(type: string) {
  return outsourceTypeLabels[type as OutsourceTypeValue] ?? type;
}

export function OutsourcingManager({
  outsourceOrders,
  filters,
  canCreateOutsourceOrder
}: {
  outsourceOrders: OutsourceOrderListItem[];
  filters: OutsourceFilters;
  canCreateOutsourceOrder: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filterForm, setFilterForm] = useState<OutsourceFilters>(filters);

  function updateFilterField(field: keyof OutsourceFilters, value: string | boolean) {
    setFilterForm((current) => ({ ...current, [field]: value }));
  }

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const keyword = filterForm.keyword.trim();
    const supplier = filterForm.supplier.trim();

    if (keyword) params.set("keyword", keyword);
    if (filterForm.status) params.set("status", filterForm.status);
    if (filterForm.type) params.set("type", filterForm.type);
    if (supplier) params.set("supplier", supplier);
    if (filterForm.startDate) params.set("startDate", filterForm.startDate);
    if (filterForm.endDate) params.set("endDate", filterForm.endDate);
    if (filterForm.overdue) params.set("overdue", "1");

    const queryString = params.toString();
    startTransition(() => router.push(queryString ? `/outsourcing?${queryString}` : "/outsourcing"));
  }

  function clearFilters() {
    setFilterForm({ keyword: "", status: "", type: "", supplier: "", startDate: "", endDate: "", overdue: false });
    startTransition(() => router.push("/outsourcing"));
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">外发电镀单</h1>
          <p className="mt-2 text-sm text-[#667085]">按订单、产品和部件创建外发记录，跟踪部件已外发和未回数量。</p>
        </div>
        {canCreateOutsourceOrder ? (
          <Link
            href="/outsourcing/new"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold !text-white hover:bg-slate-700 hover:!text-white"
            style={{ color: "#ffffff" }}
          >
            新建外发单
          </Link>
        ) : null}
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">外发单列表</h2>
        <form className="mt-4 rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm" onSubmit={submitFilters}>
          <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7">
            <label className="block text-sm font-medium md:col-span-2">
              关键词
              <input
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                placeholder="搜索外发单号、厂家、经手人、订单号、客户、产品、部件"
                value={filterForm.keyword}
                onChange={(event) => updateFilterField("keyword", event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              外发状态
              <select
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                value={filterForm.status}
                onChange={(event) => updateFilterField("status", event.target.value)}
              >
                <option value="">全部状态</option>
                {outsourceStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              外发类型
              <select
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                value={filterForm.type}
                onChange={(event) => updateFilterField("type", event.target.value)}
              >
                <option value="">全部类型</option>
                {outsourceTypeOptions.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              外发厂家
              <input
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                placeholder="外发厂家"
                value={filterForm.supplier}
                onChange={(event) => updateFilterField("supplier", event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              开始日期
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                value={filterForm.startDate}
                onChange={(event) => updateFilterField("startDate", event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              结束日期
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                value={filterForm.endDate}
                onChange={(event) => updateFilterField("endDate", event.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[#cfd6e1]"
                checked={filterForm.overdue}
                onChange={(event) => updateFilterField("overdue", event.target.checked)}
              />
              只看超期未回
            </label>
            <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isPending}>
              搜索
            </button>
            <button type="button" className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium disabled:opacity-60" onClick={clearFilters} disabled={isPending}>
              清空筛选
            </button>
          </div>
        </form>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">外发单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">外发厂家</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">外发类型</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">外发日期</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">预计回厂日期</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">经手人</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">明细数</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {outsourceOrders.map((order) => (
                <tr key={order.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{order.outsourceNo}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order.supplierName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{typeLabel(order.outsourceType)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{formatDisplayDate(order.outsourceDate)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{formatDisplayDate(order.expectedReturnDate)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{getOutsourceStatusLabel(order.status)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order.handler || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order.itemCount}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order.remark || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={`/outsourcing/${order.id}`}>
                      详情
                    </Link>
                  </td>
                </tr>
              ))}
              {outsourceOrders.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={10}>
                    暂无外发单，请先新建外发单。
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
