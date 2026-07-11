"use client";

import Link from "next/link";

export function PrintActions({ orderId }: { orderId: string }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-[#d8dde6] bg-white px-4 py-3">
      <Link
        className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        href={`/orders/${orderId}`}
      >
        返回订单详情
      </Link>
      <button
        className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 hover:text-white"
        type="button"
        onClick={() => window.print()}
      >
        打印生产任务单
      </button>
    </div>
  );
}
