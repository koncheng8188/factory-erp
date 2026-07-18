"use client";

import type { ProductPartStatus, ProductStatus } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useRef, useState } from "react";
import { getProductStatusLabel, productionStageGroups } from "@/lib/product-status";
import {
  badge,
  buttonPrimary,
  buttonSecondary,
  filterBar,
  input,
  pageDescription,
  pageHeader,
  pageShell,
  pageTitle,
  select,
  statCard,
  table,
  tableCell,
  tableHead,
  tableHeaderCell,
  tableRow,
  tableWrapper
} from "@/lib/ui-styles";

type StageFilter =
  | "all"
  | "cutting"
  | "welding"
  | "polishing"
  | "waitOutsource"
  | "outsourcing"
  | "partialReturn"
  | "returned"
  | "waitDelivery"
  | "partialDelivered"
  | "completed"
  | "abnormal";

type QuickFilter = "all" | "todo" | "abnormal" | "waitOutsource" | "outsourcing" | "waitDelivery";

type ProductionPart = {
  id: string;
  partCode: string | null;
  partName: string;
  totalQuantity: number;
  outsourcedQuantity: number;
  returnedQuantity: number;
  missingQuantity: number;
  drawingCount: number;
  status: ProductPartStatus;
  statusLabel: string;
};

type ProductionProduct = {
  id: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  productName: string;
  specification: string | null;
  material: string | null;
  quantity: number;
  surfaceTreatment: string | null;
  colors: string[];
  status: ProductStatus;
  partCount: number;
  drawingCount: number;
  outsourcedTotal: number;
  returnedTotal: number;
  missingTotal: number;
  parts: ProductionPart[];
};

type ProductionManagerProps = {
  products: ProductionProduct[];
  canPrintProduction: boolean;
  canUpdateProductionProgress: boolean;
  canReportProductionAbnormal: boolean;
  canCreateOutsourceOrder: boolean;
  canCreateOutsourceReturn: boolean;
  filters: {
    keyword: string;
    stage: StageFilter;
    quick: QuickFilter;
  };
};

type AbnormalTarget = {
  partId: string;
  orderNo: string;
  productName: string;
  partCode: string | null;
  partName: string;
};

type FlowState =
  | "未开始"
  | "进行中"
  | "已完成"
  | "待外发"
  | "外发中"
  | "已外发"
  | "部分回厂"
  | "已回厂"
  | "待送货"
  | "部分送货"
  | "异常";

type FlowCells = {
  cutting: FlowState;
  welding: FlowState;
  polishing: FlowState;
  outsourcing: FlowState;
  returning: FlowState;
  delivery: FlowState;
};

const stageOptions: { value: StageFilter; label: string }[] = [
  { value: "all", label: "全部阶段" },
  { value: "cutting", label: "下料中" },
  { value: "welding", label: "焊接中" },
  { value: "polishing", label: "抛光中" },
  { value: "waitOutsource", label: "待外发" },
  { value: "outsourcing", label: "外发中" },
  { value: "partialReturn", label: "部分回厂" },
  { value: "returned", label: "已回厂" },
  { value: "waitDelivery", label: "待送货" },
  { value: "partialDelivered", label: "部分送货" },
  { value: "completed", label: "已完成" },
  { value: "abnormal", label: "异常" }
];

const quickOptions: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "todo", label: "只看待办" },
  { value: "abnormal", label: "只看异常" },
  { value: "waitOutsource", label: "只看待外发" },
  { value: "outsourcing", label: "只看外发中" },
  { value: "waitDelivery", label: "只看待送货" }
];

const flowColumns: { key: keyof FlowCells; label: string }[] = [
  { key: "cutting", label: "下料" },
  { key: "welding", label: "焊接" },
  { key: "polishing", label: "抛光" },
  { key: "outsourcing", label: "外发" },
  { key: "returning", label: "回厂" },
  { key: "delivery", label: "送货" }
];

const productionTableWidthClass = "min-w-[1540px]";
const stickyInfoHeaderClass = "sticky left-0 top-0 z-30 w-[300px] border-b border-r border-[#d8dde6] bg-[#f6f7f9] px-3 py-3";
const stickyInfoCellClass = "sticky left-0 z-20 w-[300px] border-b border-r border-[#eef2f6] px-3 py-3";
const stickyTableHeaderCellClass = "sticky top-0 z-20 border-b border-[#d8dde6] bg-[#f6f7f9] px-3 py-3";
const compactHeaderCellClass = "sticky top-0 z-20 w-20 border-b border-[#d8dde6] bg-[#f6f7f9] px-2 py-3 text-center";
const compactCellClass = "w-20 border-b border-[#eef2f6] px-2 py-2 text-center";

const productFlowByStatus: Record<ProductStatus, FlowCells> = {
  PENDING: { cutting: "进行中", welding: "未开始", polishing: "未开始", outsourcing: "未开始", returning: "未开始", delivery: "未开始" },
  CUTTING: { cutting: "进行中", welding: "未开始", polishing: "未开始", outsourcing: "未开始", returning: "未开始", delivery: "未开始" },
  WELDING: { cutting: "已完成", welding: "进行中", polishing: "未开始", outsourcing: "未开始", returning: "未开始", delivery: "未开始" },
  POLISHING: { cutting: "已完成", welding: "已完成", polishing: "进行中", outsourcing: "未开始", returning: "未开始", delivery: "未开始" },
  WAIT_OUTSOURCE: { cutting: "已完成", welding: "已完成", polishing: "已完成", outsourcing: "待外发", returning: "未开始", delivery: "未开始" },
  OUTSOURCING: { cutting: "已完成", welding: "已完成", polishing: "已完成", outsourcing: "外发中", returning: "未开始", delivery: "未开始" },
  PARTIAL_RETURN: { cutting: "已完成", welding: "已完成", polishing: "已完成", outsourcing: "已外发", returning: "部分回厂", delivery: "未开始" },
  RETURNED: { cutting: "已完成", welding: "已完成", polishing: "已完成", outsourcing: "已外发", returning: "已回厂", delivery: "未开始" },
  WAIT_DELIVERY: { cutting: "已完成", welding: "已完成", polishing: "已完成", outsourcing: "已外发", returning: "已回厂", delivery: "待送货" },
  PARTIAL_DELIVERED: { cutting: "已完成", welding: "已完成", polishing: "已完成", outsourcing: "已外发", returning: "已回厂", delivery: "部分送货" },
  COMPLETED: { cutting: "已完成", welding: "已完成", polishing: "已完成", outsourcing: "已完成", returning: "已完成", delivery: "已完成" },
  ABNORMAL: { cutting: "异常", welding: "异常", polishing: "异常", outsourcing: "异常", returning: "异常", delivery: "异常" }
};

const advancePartLabels: Partial<Record<ProductPartStatus, string>> = {
  PENDING: "完成下料，进入焊接",
  CUTTING: "完成下料，进入焊接",
  WELDING: "完成焊接，进入抛光",
  POLISHING: "完成抛光，进入待外发"
};

const partLinkActions: Partial<Record<ProductPartStatus, { label: string; href: string; tip: string }>> = {
  WAIT_OUTSOURCE: { label: "去外发电镀", href: "/outsourcing/new", tip: "请在外发模块创建外发单" },
  OUTSOURCING: { label: "去回厂登记", href: "/returns", tip: "请登记回厂" },
  PARTIAL_RETURN: { label: "继续回厂登记", href: "/returns", tip: "还有部件未回" }
};

function formatEmpty(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

function partFlow(part: ProductionPart, productStatus: ProductStatus): FlowCells {
  let cutting: FlowState = "未开始";
  let welding: FlowState = "未开始";
  let polishing: FlowState = "未开始";
  let outsourcing: FlowState = "未开始";
  let returning: FlowState = "未开始";

  if (part.status === "PENDING" || part.status === "CUTTING") {
    cutting = "进行中";
  } else if (part.status === "WELDING") {
    cutting = "已完成";
    welding = "进行中";
  } else if (part.status === "POLISHING") {
    cutting = "已完成";
    welding = "已完成";
    polishing = "进行中";
  } else if (part.status === "WAIT_OUTSOURCE") {
    cutting = "已完成";
    welding = "已完成";
    polishing = "已完成";
    outsourcing = "待外发";
  } else if (part.status === "OUTSOURCING") {
    cutting = "已完成";
    welding = "已完成";
    polishing = "已完成";
    outsourcing = "外发中";
  } else if (part.status === "PARTIAL_RETURN") {
    cutting = "已完成";
    welding = "已完成";
    polishing = "已完成";
    outsourcing = "已外发";
    returning = "部分回厂";
  } else if (part.status === "RETURNED") {
    cutting = "已完成";
    welding = "已完成";
    polishing = "已完成";
    outsourcing = "已外发";
    returning = "已回厂";
  } else if (part.status === "ABNORMAL") {
    cutting = "异常";
    welding = "异常";
    polishing = "异常";
    outsourcing = "异常";
    returning = "异常";
  }

  let delivery: FlowState = "未开始";
  if (productStatus === "WAIT_DELIVERY") delivery = "待送货";
  if (productStatus === "PARTIAL_DELIVERED") delivery = "部分送货";
  if (productStatus === "COMPLETED") delivery = "已完成";
  if (productStatus === "ABNORMAL") delivery = "异常";

  return {
    cutting,
    welding,
    polishing,
    outsourcing,
    returning,
    delivery
  };
}

function statusClass(value: FlowState) {
  if (value === "已完成" || value === "已回厂" || value === "已外发") return "border-green-200 bg-green-50 text-green-700";
  if (value === "进行中" || value === "外发中") return "border-blue-200 bg-blue-50 text-blue-700";
  if (value === "待外发" || value === "待送货" || value === "部分回厂" || value === "部分送货") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "异常") return "border-red-200 bg-red-50 text-red-700";
  return "border-[#d8dde6] bg-[#f6f7f9] text-[#667085]";
}

function FlowBadge({ value }: { value: FlowState }) {
  return (
    <span className={`${badge} min-w-14 px-2 py-1 text-xs ${statusClass(value)}`}>
      {value}
    </span>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className={statCard}>
      <div className="text-sm font-medium text-[#667085]">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-[#172033]">{value}</div>
    </div>
  );
}

export function ProductionManager({
  products,
  filters,
  canPrintProduction,
  canUpdateProductionProgress,
  canReportProductionAbnormal,
  canCreateOutsourceOrder,
  canCreateOutsourceReturn
}: ProductionManagerProps) {
  const router = useRouter();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const floatingScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updatingPartId, setUpdatingPartId] = useState<string | null>(null);
  const [abnormalTarget, setAbnormalTarget] = useState<AbnormalTarget | null>(null);
  const [abnormalReason, setAbnormalReason] = useState("");
  const [abnormalSubmitting, setAbnormalSubmitting] = useState(false);

  function syncHorizontalScroll(source: "table" | "floating") {
    if (syncingScrollRef.current) return;

    const scrollRefs = {
      table: tableScrollRef,
      floating: floatingScrollRef
    };
    const sourceElement = scrollRefs[source].current;
    if (!sourceElement) return;

    syncingScrollRef.current = true;
    Object.entries(scrollRefs).forEach(([key, ref]) => {
      if (key !== source && ref.current) {
        ref.current.scrollLeft = sourceElement.scrollLeft;
      }
    });
    syncingScrollRef.current = false;
  }

  async function advancePart(part: ProductionPart) {
    if (!canUpdateProductionProgress) return;

    setMessage("");
    setError("");
    setUpdatingPartId(part.id);

    const response = await fetch(`/api/parts/${part.id}/advance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        expectedStatus: part.status
      })
    });
    const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查服务端日志。" }));

    setUpdatingPartId(null);

    if (!response.ok) {
      setError(data.error ?? "推进部件状态失败。");
      return;
    }

    setMessage(`${part.partName} 已推进到下一阶段。`);
    router.refresh();
  }

  function openAbnormalModal(product: ProductionProduct, part: ProductionPart) {
    if (!canReportProductionAbnormal) return;

    setMessage("");
    setError("");
    setAbnormalReason("");
    setAbnormalTarget({
      partId: part.id,
      orderNo: product.orderNo,
      productName: product.productName,
      partCode: part.partCode,
      partName: part.partName
    });
  }

  function closeAbnormalModal() {
    if (abnormalSubmitting) return;
    setAbnormalTarget(null);
    setAbnormalReason("");
  }

  async function registerAbnormal() {
    if (!canReportProductionAbnormal) return;
    if (!abnormalTarget) return;

    const reason = abnormalReason.trim();
    if (!reason) {
      setError("请填写异常原因。");
      return;
    }

    if (reason.length > 500) {
      setError("异常原因不能超过 500 字。");
      return;
    }

    setMessage("");
    setError("");
    setAbnormalSubmitting(true);

    const response = await fetch(`/api/parts/${abnormalTarget.partId}/abnormal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason })
    });
    const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查服务端日志。" }));

    setAbnormalSubmitting(false);

    if (!response.ok) {
      setError(data.error ?? "登记生产异常失败。");
      return;
    }

    setMessage(`${abnormalTarget.partName} 已登记生产异常。`);
    setAbnormalTarget(null);
    setAbnormalReason("");
    router.refresh();
  }

  function renderAbnormalButton(product: ProductionProduct, part: ProductionPart) {
    if (!canReportProductionAbnormal) return null;

    return (
      <button
        className="inline-flex rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"
        type="button"
        onClick={() => openAbnormalModal(product, part)}
      >
        登记异常
      </button>
    );
  }

  function renderPartAction(product: ProductionProduct, part: ProductionPart) {
    const advanceLabel = advancePartLabels[part.status];
    const linkAction = partLinkActions[part.status];

    if (part.status === "ABNORMAL") {
      return (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-red-700">异常处理中</div>
          <Link className="inline-flex rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100" href="/production/abnormal">
            查看异常
          </Link>
        </div>
      );
    }

    if (advanceLabel) {
      return (
        <div className="flex flex-wrap gap-2">
          {canUpdateProductionProgress ? (
            <button
              className="rounded-md bg-[#172033] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#344054] hover:text-white disabled:opacity-60"
              disabled={updatingPartId === part.id}
              onClick={() => advancePart(part)}
            >
              {updatingPartId === part.id ? "更新中" : advanceLabel}
            </button>
          ) : null}
          {renderAbnormalButton(product, part)}
        </div>
      );
    }

    if (linkAction) {
      const canRenderLinkAction =
        part.status === "WAIT_OUTSOURCE"
          ? canCreateOutsourceOrder
          : canCreateOutsourceReturn;

      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {canRenderLinkAction ? (
              <Link className="inline-flex rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm font-semibold text-[#344054] hover:bg-[#f6f7f9]" href={linkAction.href}>
                {linkAction.label}
              </Link>
            ) : null}
            {renderAbnormalButton(product, part)}
          </div>
          {canRenderLinkAction ? <div className="text-xs text-[#667085]">{linkAction.tip}</div> : null}
        </div>
      );
    }

    if (part.status === "RETURNED") {
      return (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-green-700">已回厂，等待产品齐套送货</div>
          {renderAbnormalButton(product, part)}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <span className="text-sm text-[#667085]">-</span>
        <div>{renderAbnormalButton(product, part)}</div>
      </div>
    );
  }

  const stageFilterLabel = filters.stage === "all" ? "全部" : stageOptions.find((option) => option.value === filters.stage)?.label ?? "全部";
  const quickFilterLabel = filters.quick === "all" ? "全部" : quickOptions.find((option) => option.value === filters.quick)?.label ?? "全部";
  const printTime = new Date().toLocaleString("zh-CN", { hour12: false });

  return (
    <div className={`${pageShell} pb-14`}>
      <section className={`no-print ${pageHeader}`}>
        <div>
          <h1 className={pageTitle}>生产进度</h1>
          <p className={pageDescription}>以产品为单位查看全流程进度，生产推进操作由部件子行驱动。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className={buttonSecondary}
            href="/production/abnormal"
          >
            异常列表
          </Link>
          <Link
            className={buttonSecondary}
            href="/production/daily"
          >
            生产日报
          </Link>
          {canPrintProduction ? (
            <button
              className={buttonPrimary}
              type="button"
              onClick={() => window.print()}
            >
              打印生产进度跟踪表
            </button>
          ) : null}
        </div>
      </section>

      <section className={`no-print ${filterBar}`}>
        <form className="grid gap-4 lg:grid-cols-[1fr_220px_220px_auto_auto]" action="/production">
          <label className="block text-sm font-medium">
            关键词
            <input
              className={input}
              name="keyword"
              placeholder="订单号、客户、产品、规格、材质、表面处理、颜色、部件"
              defaultValue={filters.keyword}
            />
          </label>
          <label className="block text-sm font-medium">
            流程阶段
            <select className={select} name="stage" defaultValue={filters.stage}>
              {stageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            快捷筛选
            <select className={select} name="quick" defaultValue={filters.quick}>
              {quickOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className={`w-full ${buttonPrimary}`}>
              查询
            </button>
          </div>
          <div className="flex items-end">
            <Link className={`w-full ${buttonSecondary}`} href="/production">
              清空
            </Link>
          </div>
        </form>
      </section>

      {message ? <div className="no-print rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="no-print rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="no-print grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="产品总数" value={products.length} />
        {productionStageGroups.map((group) => (
          <StatCard key={group.key} title={group.label} value={products.filter((product) => group.statuses.includes(product.status)).length} />
        ))}
      </section>

      <section className="no-print">
        <div ref={tableScrollRef} className={`${tableWrapper} production-table-scroll`} onScroll={() => syncHorizontalScroll("table")}>
          <table className={`${table} ${productionTableWidthClass}`}>
            <thead className={tableHead}>
              <tr>
                <th className={stickyInfoHeaderClass}>订单 / 产品 / 部件</th>
                <th className={stickyTableHeaderCellClass}>规格 / 图纸</th>
                <th className={stickyTableHeaderCellClass}>数量 / 外发</th>
                <th className={stickyTableHeaderCellClass}>汇总 / 回厂</th>
                {flowColumns.map((column) => (
                  <th key={column.key} className={compactHeaderCellClass}>{column.label}</th>
                ))}
                <th className={compactHeaderCellClass}>当前阶段</th>
                <th className={stickyTableHeaderCellClass}>操作</th>
                <th className={stickyTableHeaderCellClass}>查看订单</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const productFlow = productFlowByStatus[product.status];
                return (
                  <Fragment key={product.id}>
                    <tr className={`${tableRow} bg-[#f8fafc] font-medium`}>
                      <td className={`${stickyInfoCellClass} bg-[#f8fafc]`}>
                        <div className="font-semibold text-[#172033]">{product.orderNo}</div>
                        <div className="mt-1 text-xs font-medium text-[#475467]">{product.customerName}</div>
                        <div className="mt-1 text-sm font-semibold text-[#172033]">{product.productName}</div>
                      </td>
                      <td className={tableCell}>{formatEmpty(product.specification)}</td>
                      <td className={tableCell}>{product.quantity}</td>
                      <td className={`${tableCell} text-xs leading-5 text-[#475467]`}>
                        <div>材质：{formatEmpty(product.material)}</div>
                        <div>表面：{formatEmpty(product.surfaceTreatment)}</div>
                        <div>颜色：{product.colors.length ? product.colors.join("、") : "-"}</div>
                        <div>部件/图纸：{product.partCount}/{product.drawingCount}</div>
                        <div>外发/回厂/未回：{product.outsourcedTotal}/{product.returnedTotal}/{product.missingTotal}</div>
                      </td>
                      {flowColumns.map((column) => (
                        <td key={column.key} className={compactCellClass}>
                          <FlowBadge value={productFlow[column.key]} />
                        </td>
                      ))}
                      <td className={`${compactCellClass} font-semibold`}>{getProductStatusLabel(product.status)}</td>
                      <td className={`${tableCell} text-[#667085]`}>由部件同步</td>
                      <td className={tableCell}>
                        <Link className="rounded-md border border-[#cfd6e1] bg-white px-3 py-1.5 text-sm font-medium text-[#344054] hover:bg-[#f6f7f9]" href={`/orders/${product.orderId}`}>
                          查看订单
                        </Link>
                      </td>
                    </tr>
                    {product.parts.length > 0 ? (
                      product.parts.map((part) => {
                        const flow = partFlow(part, product.status);
                        return (
                          <tr key={part.id} className="bg-white align-top text-xs transition hover:bg-[#fbfcfd]">
                            <td className={`${stickyInfoCellClass} bg-white pl-7`}>
                              <div className="text-[#667085]">部件编号：{formatEmpty(part.partCode)}</div>
                              <div className="mt-1 font-semibold text-[#172033]">{part.partName}</div>
                            </td>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{part.drawingCount}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{part.totalQuantity} / {part.outsourcedQuantity}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2 text-[#475467]">
                              <div>已回：{part.returnedQuantity}</div>
                              <div>未回：{part.missingQuantity}</div>
                              <div>{part.statusLabel}</div>
                            </td>
                            {flowColumns.map((column) => (
                              <td key={column.key} className={compactCellClass}>
                                <FlowBadge value={flow[column.key]} />
                              </td>
                            ))}
                            <td className={compactCellClass}>{part.statusLabel}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{renderPartAction(product, part)}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2 text-[#667085]">-</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr className="bg-[#fbfcfd] text-xs">
                        <td className="border-t border-[#eef2f6] px-2 py-3 pl-6 text-[#667085]" colSpan={13}>暂无部件</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {products.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-[#667085]" colSpan={13}>
                    暂无生产进度数据。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="no-print fixed bottom-0 left-0 right-0 z-40 border-t border-[#d8dde6] bg-white/95 px-4 py-2 shadow-lg backdrop-blur md:left-64">
        <div className="mx-auto grid max-w-[1680px] gap-1 sm:grid-cols-[88px_1fr] sm:items-center">
          <div className="text-xs font-medium text-[#667085]">横向滚动</div>
          <div
            ref={floatingScrollRef}
            className="h-3 overflow-x-auto overflow-y-hidden"
            onScroll={() => syncHorizontalScroll("floating")}
          >
            <div className={`h-1 ${productionTableWidthClass}`} />
          </div>
        </div>
      </div>

      <section className="print-only hidden">
        <div className="mb-4 text-center">
          <h1 className="text-xl font-bold">金鸿ERP 生产跟踪表</h1>
          <div className="mt-2 text-xs">
            <span>打印时间：{printTime}</span>
            <span className="ml-4">关键词：{filters.keyword || "全部"}</span>
            <span className="ml-4">阶段：{stageFilterLabel}</span>
            <span className="ml-4">快捷筛选：{quickFilterLabel}</span>
          </div>
        </div>
        {products.length === 0 ? (
          <div className="py-8 text-center text-sm">暂无生产进度数据</div>
        ) : (
          <table className="production-print-table">
            <thead>
              <tr>
                <th>订单号</th>
                <th>客户</th>
                <th>产品名称</th>
                <th>规格</th>
                <th>产品数量</th>
                <th>部件编号</th>
                <th>部件名称</th>
                <th>部件总数</th>
                <th>图纸数</th>
                <th>已外发</th>
                <th>已回</th>
                <th>未回</th>
                <th>下料</th>
                <th>焊接</th>
                <th>抛光</th>
                <th>外发</th>
                <th>回厂</th>
                <th>送货</th>
                <th>当前阶段</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {products.flatMap((product) => {
                if (product.parts.length === 0) {
                  const productFlow = productFlowByStatus[product.status];
                  return [
                    <tr key={`${product.id}-empty`}>
                      <td>{product.orderNo}</td>
                      <td>{product.customerName}</td>
                      <td>{product.productName}</td>
                      <td>{formatEmpty(product.specification)}</td>
                      <td>{product.quantity}</td>
                      <td>-</td>
                      <td>暂无部件</td>
                      <td>-</td>
                      <td>{product.drawingCount}</td>
                      <td>{product.outsourcedTotal}</td>
                      <td>{product.returnedTotal}</td>
                      <td>{product.missingTotal}</td>
                      <td>{productFlow.cutting}</td>
                      <td>{productFlow.welding}</td>
                      <td>{productFlow.polishing}</td>
                      <td>{productFlow.outsourcing}</td>
                      <td>{productFlow.returning}</td>
                      <td>{productFlow.delivery}</td>
                      <td>{getProductStatusLabel(product.status)}</td>
                      <td>-</td>
                    </tr>
                  ];
                }

                return product.parts.map((part) => {
                  const flow = partFlow(part, product.status);
                  return (
                    <tr key={`${product.id}-${part.id}`}>
                      <td>{product.orderNo}</td>
                      <td>{product.customerName}</td>
                      <td>{product.productName}</td>
                      <td>{formatEmpty(product.specification)}</td>
                      <td>{product.quantity}</td>
                      <td>{formatEmpty(part.partCode)}</td>
                      <td>{part.partName}</td>
                      <td>{part.totalQuantity}</td>
                      <td>{part.drawingCount}</td>
                      <td>{part.outsourcedQuantity}</td>
                      <td>{part.returnedQuantity}</td>
                      <td>{part.missingQuantity}</td>
                      <td>{flow.cutting}</td>
                      <td>{flow.welding}</td>
                      <td>{flow.polishing}</td>
                      <td>{flow.outsourcing}</td>
                      <td>{flow.returning}</td>
                      <td>{flow.delivery}</td>
                      <td>{part.statusLabel}</td>
                      <td>-</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        )}
      </section>

      {abnormalTarget ? (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-lg border border-[#d8dde6] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#172033]">登记生产异常</h2>
                <p className="mt-1 text-sm text-[#667085]">提交后该部件会进入异常状态，并同步产品状态。</p>
              </div>
              <button
                className="rounded-md border border-[#cfd6e1] px-2 py-1 text-sm text-[#667085] hover:bg-[#f6f7f9]"
                type="button"
                onClick={closeAbnormalModal}
              >
                关闭
              </button>
            </div>
            <div className="mb-4 grid gap-2 rounded-lg bg-[#f6f7f9] p-3 text-sm">
              <div>订单号：{abnormalTarget.orderNo}</div>
              <div>产品：{abnormalTarget.productName}</div>
              <div>部件编号：{formatEmpty(abnormalTarget.partCode)}</div>
              <div>部件名称：{abnormalTarget.partName}</div>
            </div>
            <label className="block text-sm font-medium">
              异常原因
              <textarea
                className="mt-1 min-h-28 w-full rounded-md border border-[#cfd6e1] px-3 py-2 text-sm outline-none focus:border-[#172033]"
                maxLength={500}
                value={abnormalReason}
                onChange={(event) => setAbnormalReason(event.target.value)}
                placeholder="例如：尺寸错误、焊接错误、抛光返工、颜色不对、少件、图纸看错..."
              />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button
                className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#f6f7f9]"
                type="button"
                disabled={abnormalSubmitting}
                onClick={closeAbnormalModal}
              >
                取消
              </button>
              <button
                className="rounded-md bg-[#172033] px-4 py-2 text-sm font-semibold text-white hover:bg-[#344054] hover:text-white disabled:opacity-60"
                type="button"
                disabled={abnormalSubmitting}
                onClick={registerAbnormal}
              >
                {abnormalSubmitting ? "提交中" : "确认登记"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        .production-table-scroll {
          scrollbar-width: none;
        }

        .production-table-scroll::-webkit-scrollbar {
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
            margin: 0 !important;
            padding: 0 !important;
          }

          .md\\:pl-64 {
            padding-left: 0 !important;
          }

          .production-print-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            line-height: 1.25;
          }

          .production-print-table th,
          .production-print-table td {
            border: 1px solid #000;
            padding: 4px;
            vertical-align: top;
            color: #000;
          }

          .production-print-table th {
            background: #f3f4f6 !important;
            font-weight: 700;
            text-align: center;
          }

          .production-print-table tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
