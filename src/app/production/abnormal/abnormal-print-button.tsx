"use client";

export function AbnormalPrintButton() {
  return (
    <button
      className="no-print inline-flex items-center justify-center rounded-lg bg-[#172033] px-4 py-2 text-sm font-semibold text-white hover:bg-[#344054] hover:text-white"
      type="button"
      onClick={() => window.print()}
    >
      打印异常清单
    </button>
  );
}
