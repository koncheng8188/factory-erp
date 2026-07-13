import type { Prisma, ProductPartAbnormalStatus } from "@prisma/client";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/authorization";
import { hasPermission } from "@/lib/permissions";
import { getProductPartStatusLabel } from "@/lib/product-part-status";
import { prisma } from "@/lib/prisma";
import { AbnormalPrintButton } from "./abnormal-print-button";
import { AbnormalResolveActions } from "./abnormal-resolve-actions";

export const dynamic = "force-dynamic";

type ProductionAbnormalPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type StatusFilter = "all" | "open" | "resolved";

const validStatusFilters = new Set<StatusFilter>(["all", "open", "resolved"]);

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseStatusFilter(value: string): StatusFilter {
  return validStatusFilters.has(value as StatusFilter) ? value as StatusFilter : "all";
}

function parseDateFilter(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nextDate(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

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

function statusFilterLabel(status: StatusFilter) {
  if (status === "open") return "未处理";
  if (status === "resolved") return "已处理";
  return "全部";
}

function buildFilterSummary({
  status,
  keyword,
  startDate,
  endDate
}: {
  status: StatusFilter;
  keyword: string;
  startDate: string;
  endDate: string;
}) {
  return [
    `状态：${statusFilterLabel(status)}`,
    `关键词：${keyword || "全部"}`,
    `开始日期：${startDate || "不限"}`,
    `结束日期：${endDate || "不限"}`
  ].join("；");
}

function StatCard({ title, value, tone = "normal" }: { title: string; value: number; tone?: "normal" | "danger" | "success" | "info" }) {
  const toneClass = {
    normal: "border-[#d8dde6] bg-white text-[#172033]",
    danger: "border-red-200 bg-red-50 text-red-700",
    success: "border-green-200 bg-green-50 text-green-700",
    info: "border-blue-200 bg-blue-50 text-blue-700"
  }[tone];

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default async function ProductionAbnormalPage({ searchParams }: ProductionAbnormalPageProps) {
  const user = await requirePagePermission("production.abnormal.view");
  const canPrintAbnormal = hasPermission(user.role, "production.abnormal.print", []);

  const params = await searchParams;
  const status = parseStatusFilter(firstQueryValue(params?.status).trim());
  const keyword = firstQueryValue(params?.keyword).trim();
  const startDateInput = firstQueryValue(params?.startDate).trim();
  const endDateInput = firstQueryValue(params?.endDate).trim();
  const startDate = parseDateFilter(startDateInput);
  const endDate = parseDateFilter(endDateInput);
  const andConditions: Prisma.ProductPartAbnormalWhereInput[] = [];

  if (status !== "all") {
    andConditions.push({ status: status.toUpperCase() as ProductPartAbnormalStatus });
  }

  if (startDate || endDate) {
    andConditions.push({
      createdAt: {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lt: nextDate(endDate) } : {})
      }
    });
  }

  if (keyword) {
    andConditions.push({
      OR: [
        { order: { is: { orderNo: { contains: keyword } } } },
        { order: { is: { customerName: { contains: keyword } } } },
        { order: { is: { customer: { is: { name: { contains: keyword } } } } } },
        { product: { is: { productName: { contains: keyword } } } },
        { productPart: { is: { partCode: { contains: keyword } } } },
        { productPart: { is: { partName: { contains: keyword } } } },
        { reason: { contains: keyword } },
        { resolvedRemark: { contains: keyword } }
      ]
    });
  }

  const where: Prisma.ProductPartAbnormalWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

  const abnormals = await prisma.productPartAbnormal.findMany({
    where,
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

  const today = startOfToday();
  const tomorrow = nextDate(today);
  const openCount = abnormals.filter((abnormal) => abnormal.status === "OPEN").length;
  const resolvedCount = abnormals.filter((abnormal) => abnormal.status === "RESOLVED").length;
  const todayNewCount = abnormals.filter((abnormal) => abnormal.createdAt >= today && abnormal.createdAt < tomorrow).length;
  const printTime = new Date().toLocaleString("zh-CN", { hour12: false });
  const filterSummary = buildFilterSummary({
    status,
    keyword,
    startDate: startDateInput,
    endDate: endDateInput
  });

  return (
    <div className="space-y-6">
      <section className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">生产异常列表</h1>
          <p className="mt-2 text-sm text-[#667085]">查看生产异常原因，处理完成后恢复部件生产阶段。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canPrintAbnormal ? <AbnormalPrintButton /> : null}
          <Link
            className="inline-flex items-center justify-center rounded-lg border border-[#cfd6e1] px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f6f7f9]"
            href="/production"
          >
            返回生产进度
          </Link>
        </div>
      </section>

      <section className="no-print rounded-lg border border-[#d8dde6] bg-white p-5 shadow-sm">
        <form className="grid gap-4 lg:grid-cols-[180px_180px_180px_1fr_auto_auto]" action="/production/abnormal">
          <label className="block text-sm font-medium">
            处理状态
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2 text-sm" name="status" defaultValue={status}>
              <option value="all">全部</option>
              <option value="open">未处理</option>
              <option value="resolved">已处理</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            开始日期
            <input
              className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2 text-sm"
              type="date"
              name="startDate"
              defaultValue={startDateInput}
            />
          </label>
          <label className="block text-sm font-medium">
            结束日期
            <input
              className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2 text-sm"
              type="date"
              name="endDate"
              defaultValue={endDateInput}
            />
          </label>
          <label className="block text-sm font-medium">
            关键词
            <input
              className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2 text-sm"
              name="keyword"
              placeholder="搜索订单号、客户、产品、部件、异常原因"
              defaultValue={keyword}
            />
          </label>
          <div className="flex items-end">
            <button className="w-full rounded-md bg-[#172033] px-4 py-2 text-sm font-semibold text-white hover:bg-[#344054] hover:text-white">
              查询
            </button>
          </div>
          <div className="flex items-end">
            <Link className="w-full rounded-md border border-[#cfd6e1] px-4 py-2 text-center text-sm font-semibold text-[#344054] hover:bg-[#f6f7f9]" href="/production/abnormal">
              重置
            </Link>
          </div>
        </form>
      </section>

      <section className="no-print grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="异常总数" value={abnormals.length} />
        <StatCard title="未处理异常" value={openCount} tone="danger" />
        <StatCard title="已处理异常" value={resolvedCount} tone="success" />
        <StatCard title="今日新增异常" value={todayNewCount} tone="info" />
      </section>

      <section className="no-print rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm">
        <div className="mb-4 text-sm text-[#667085]">当前筛选：{filterSummary}</div>
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

      <section className="print-only hidden">
        <div className="mb-4 text-center">
          <h1 className="text-xl font-bold">金鸿ERP 生产异常清单</h1>
          <div className="mt-2 grid grid-cols-2 gap-2 text-left text-xs">
            <div>打印时间：{printTime}</div>
            <div>筛选条件：{filterSummary}</div>
            <div>异常总数：{abnormals.length}</div>
            <div>未处理数量：{openCount}</div>
            <div>已处理数量：{resolvedCount}</div>
            <div>今日新增数量：{todayNewCount}</div>
          </div>
        </div>

        {abnormals.length === 0 ? (
          <div className="py-8 text-center text-sm">暂无生产异常记录</div>
        ) : (
          <table className="abnormal-print-table">
            <thead>
              <tr>
                <th>异常时间</th>
                <th>订单号</th>
                <th>客户</th>
                <th>产品</th>
                <th>部件编号</th>
                <th>部件名称</th>
                <th>异常原因</th>
                <th>原状态</th>
                <th>当前状态</th>
                <th>处理状态</th>
                <th>处理时间</th>
                <th>处理备注</th>
              </tr>
            </thead>
            <tbody>
              {abnormals.map((abnormal) => (
                <tr key={`print-${abnormal.id}`}>
                  <td>{formatDateTime(abnormal.createdAt)}</td>
                  <td>{abnormal.order.orderNo}</td>
                  <td>{abnormal.order.customer.name || abnormal.order.customerName}</td>
                  <td>{abnormal.product.productName}</td>
                  <td>{displayValue(abnormal.productPart.partCode)}</td>
                  <td>{abnormal.productPart.partName}</td>
                  <td>{abnormal.reason}</td>
                  <td>{getProductPartStatusLabel(abnormal.fromStatus)}</td>
                  <td>{getProductPartStatusLabel(abnormal.productPart.status)}</td>
                  <td>{abnormalStatusLabel(abnormal.status)}</td>
                  <td>{formatDateTime(abnormal.resolvedAt)}</td>
                  <td>{displayValue(abnormal.resolvedRemark)}</td>
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

            .abnormal-print-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 9px;
              line-height: 1.25;
            }

            .abnormal-print-table th,
            .abnormal-print-table td {
              border: 1px solid #000;
              padding: 4px;
              vertical-align: top;
              color: #000;
            }

            .abnormal-print-table th {
              background: #f3f4f6 !important;
              font-weight: 700;
              text-align: center;
            }

            .abnormal-print-table tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        `}</style>
      </section>
    </div>
  );
}
