"use client";

import Link from "next/link";

export function PrintActions({ id }: { id: string }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-[#d8dde6] bg-white px-4 py-3">
      <Link
        className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        href={`/returns/${id}`}
      >
        返回回厂详情
      </Link>
      <button
        className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white !text-white shadow-sm hover:bg-slate-700 hover:text-white hover:!text-white"
        type="button"
        onClick={() => window.print()}
      >
        打印回厂验收单
      </button>
    </div>
  );
}
