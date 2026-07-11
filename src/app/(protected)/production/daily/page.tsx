import Link from "next/link";
import { getProductPartStatusLabel } from "@/lib/product-part-status";
import { prisma } from "@/lib/prisma";
import { DailyPrintButton } from "./daily-print-button";

export const dynamic = "force-dynamic";

type ProductionDailyPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayInputValue() {
  return formatDateInput(new Date());
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

function formatTime(value: Date) {
  return value.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function displayValue(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-[#667085]">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-[#172033]">{value}</div>
    </div>
  );
}

export default async function ProductionDailyPage({ searchParams }: ProductionDailyPageProps) {
  const params = await searchParams;
  const rawDate = firstQueryValue(params?.date).trim();
  const parsedDate = parseDateFilter(rawDate);
  const selectedDate = parsedDate ?? parseDateFilter(todayInputValue()) ?? new Date();
  const selectedDateInput = formatDateInput(selectedDate);

  const logs = await prisma.productPartProgressLog.findMany({
    where: {
      occurredAt: {
        gte: selectedDate,
        lt: nextDate(selectedDate)
      }
    },
    orderBy: { occurredAt: "desc" },
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

  const cuttingDoneCount = logs.filter((log) => log.toStatus === "WELDING").length;
  const weldingDoneCount = logs.filter((log) => log.toStatus === "POLISHING").length;
  const polishingDoneCount = logs.filter((log) => log.toStatus === "WAIT_OUTSOURCE").length;
  const today = todayInputValue();
  const printTime = new Date().toLocaleString("zh-CN", { hour12: false });

  return (
    <div className="space-y-6">
      <section className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">生产日报</h1>
          <p className="mt-2 text-sm text-[#667085]">按日期查看部件生产推进完成记录。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DailyPrintButton />
          <Link
            className="inline-flex items-center justify-center rounded-lg border border-[#cfd6e1] px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f6f7f9]"
            href="/production"
          >
            返回生产进度
          </Link>
        </div>
      </section>

      <section className="no-print rounded-lg border border-[#d8dde6] bg-white p-5 shadow-sm">
        <form className="flex flex-wrap items-end gap-3" action="/production/daily">
          <label className="block text-sm font-medium">
            日期
            <input
              className="mt-1 w-52 rounded-md border border-[#cfd6e1] px-3 py-2"
              type="date"
              name="date"
              defaultValue={selectedDateInput}
            />
          </label>
          <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-semibold text-white hover:bg-[#344054]">
            查询
          </button>
          <Link
            className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f6f7f9]"
            href={`/production/daily?date=${today}`}
          >
            今天
          </Link>
        </form>
      </section>

      <section className="no-print grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="总记录数" value={logs.length} />
        <StatCard title="下料完成数量" value={cuttingDoneCount} />
        <StatCard title="焊接完成数量" value={weldingDoneCount} />
        <StatCard title="抛光完成数量" value={polishingDoneCount} />
      </section>

      <section className="no-print rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">完成记录明细</h2>
          <div className="text-sm text-[#667085]">日期：{selectedDateInput}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">时间</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">客户名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件编号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">原状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">新状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3">{formatTime(log.occurredAt)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{log.order.orderNo}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{log.order.customer.name || log.order.customerName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{log.product.productName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{displayValue(log.productPart.partCode)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{log.productPart.partName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{getProductPartStatusLabel(log.fromStatus)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{getProductPartStatusLabel(log.toStatus)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{log.actionName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{displayValue(log.remark)}</td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-[#667085]" colSpan={10}>
                    当天暂无生产推进记录。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="print-only hidden">
        <div className="mb-4 text-center">
          <h1 className="text-xl font-bold">金鸿ERP 生产日报</h1>
          <div className="mt-2 grid grid-cols-3 gap-2 text-left text-xs">
            <div>日期：{selectedDateInput}</div>
            <div>打印时间：{printTime}</div>
            <div>总记录数：{logs.length}</div>
            <div>下料完成数量：{cuttingDoneCount}</div>
            <div>焊接完成数量：{weldingDoneCount}</div>
            <div>抛光完成数量：{polishingDoneCount}</div>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="py-8 text-center text-sm">暂无生产日报记录</div>
        ) : (
          <table className="daily-print-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>订单号</th>
                <th>客户名称</th>
                <th>产品名称</th>
                <th>部件编号</th>
                <th>部件名称</th>
                <th>原状态</th>
                <th>新状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={`print-${log.id}`}>
                  <td>{formatTime(log.occurredAt)}</td>
                  <td>{log.order.orderNo}</td>
                  <td>{log.order.customer.name || log.order.customerName}</td>
                  <td>{log.product.productName}</td>
                  <td>{displayValue(log.productPart.partCode)}</td>
                  <td>{log.productPart.partName}</td>
                  <td>{getProductPartStatusLabel(log.fromStatus)}</td>
                  <td>{getProductPartStatusLabel(log.toStatus)}</td>
                  <td>{log.actionName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <style>{`
          .print-only {
            display: none;
          }

          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          @media print {
            .no-print,
            aside,
            header {
              display: none !important;
            }

            .print-only {
              display: block !important;
            }

            body {
              background: white !important;
              color: #000 !important;
            }

            main {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 !important;
            }

            .md\\:pl-64 {
              padding-left: 0 !important;
            }

            .daily-print-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10px;
              line-height: 1.25;
            }

            .daily-print-table th,
            .daily-print-table td {
              border: 1px solid #000;
              padding: 4px;
              vertical-align: top;
              color: #000;
            }

            .daily-print-table th {
              background: #f3f4f6 !important;
              font-weight: 700;
              text-align: center;
            }

            .daily-print-table tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        `}</style>
      </section>
    </div>
  );
}
