"use client";

import Link from "next/link";
import { formatDisplayDate, outsourceTypeLabels, type OutsourceTypeValue } from "@/lib/outsource";

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

function typeLabel(type: string) {
  return outsourceTypeLabels[type as OutsourceTypeValue] ?? type;
}

export function OutsourcingManager({ outsourceOrders }: { outsourceOrders: OutsourceOrderListItem[] }) {
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">外发电镀单</h1>
          <p className="mt-2 text-sm text-[#667085]">按订单、产品和部件创建外发记录，跟踪部件已外发和未回数量。</p>
        </div>
        <Link
          href="/outsourcing/new"
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold !text-white hover:bg-slate-700 hover:!text-white"
          style={{ color: "#ffffff" }}
        >
          新建外发单
        </Link>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">外发单列表</h2>
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
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order.status}</td>
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
