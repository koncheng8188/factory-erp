"use client";

import type { ProductPartStatus, ProductStatus } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { getProductStatusLabel, productionStageGroups } from "@/lib/product-status";

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
  filters: {
    keyword: string;
    stage: StageFilter;
    quick: QuickFilter;
  };
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
    <span className={`inline-flex min-w-16 justify-center rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(value)}`}>
      {value}
    </span>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-[#667085]">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-[#172033]">{value}</div>
    </div>
  );
}

export function ProductionManager({ products, filters }: ProductionManagerProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updatingPartId, setUpdatingPartId] = useState<string | null>(null);

  async function advancePart(part: ProductionPart) {
    setMessage("");
    setError("");
    setUpdatingPartId(part.id);

    const response = await fetch(`/api/parts/${part.id}/advance`, { method: "POST" });
    const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查服务端日志。" }));

    setUpdatingPartId(null);

    if (!response.ok) {
      setError(data.error ?? "推进部件状态失败。");
      return;
    }

    setMessage(`${part.partName} 已推进到下一阶段。`);
    router.refresh();
  }

  function renderPartAction(part: ProductionPart) {
    const advanceLabel = advancePartLabels[part.status];
    const linkAction = partLinkActions[part.status];

    if (advanceLabel) {
      return (
        <button
          className="rounded-md bg-[#172033] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#344054] disabled:opacity-60"
          disabled={updatingPartId === part.id}
          onClick={() => advancePart(part)}
        >
          {updatingPartId === part.id ? "更新中" : advanceLabel}
        </button>
      );
    }

    if (linkAction) {
      return (
        <div className="space-y-1">
          <Link className="inline-flex rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm font-semibold text-[#344054] hover:bg-[#f6f7f9]" href={linkAction.href}>
            {linkAction.label}
          </Link>
          <div className="text-xs text-[#667085]">{linkAction.tip}</div>
        </div>
      );
    }

    if (part.status === "RETURNED") return <span className="text-sm font-semibold text-green-700">已回厂，等待产品齐套送货</span>;
    if (part.status === "ABNORMAL") return <span className="text-sm font-semibold text-red-700">异常，请人工处理</span>;
    return <span className="text-sm text-[#667085]">-</span>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">生产进度</h1>
        <p className="mt-2 text-sm text-[#667085]">以产品为单位查看全流程进度，生产推进操作由部件子行驱动。</p>
      </section>

      <section className="rounded-lg border border-[#d8dde6] bg-white p-5 shadow-sm">
        <form className="grid gap-4 lg:grid-cols-[1fr_220px_220px_auto_auto]" action="/production">
          <label className="block text-sm font-medium">
            关键词
            <input
              className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
              name="keyword"
              placeholder="订单号、客户、产品、规格、材质、表面处理、颜色、部件"
              defaultValue={filters.keyword}
            />
          </label>
          <label className="block text-sm font-medium">
            流程阶段
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" name="stage" defaultValue={filters.stage}>
              {stageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            快捷筛选
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" name="quick" defaultValue={filters.quick}>
              {quickOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className="w-full rounded-md bg-[#172033] px-4 py-2 text-sm font-semibold text-white hover:bg-[#344054]">
              查询
            </button>
          </div>
          <div className="flex items-end">
            <Link className="w-full rounded-md border border-[#cfd6e1] px-4 py-2 text-center text-sm font-semibold text-[#344054] hover:bg-[#f6f7f9]" href="/production">
              清空
            </Link>
          </div>
        </form>
      </section>

      {message ? <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="产品总数" value={products.length} />
        {productionStageGroups.map((group) => (
          <StatCard key={group.key} title={group.label} value={products.filter((product) => group.statuses.includes(product.status)).length} />
        ))}
      </section>

      <section className="rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1780px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-2 py-2">订单 / 部件编号</th>
                <th className="border-b border-[#d8dde6] px-2 py-2">客户 / 部件名称</th>
                <th className="border-b border-[#d8dde6] px-2 py-2">产品 / 总数</th>
                <th className="border-b border-[#d8dde6] px-2 py-2">规格 / 图纸</th>
                <th className="border-b border-[#d8dde6] px-2 py-2">数量 / 外发</th>
                <th className="border-b border-[#d8dde6] px-2 py-2">汇总 / 回厂</th>
                {flowColumns.map((column) => (
                  <th key={column.key} className="border-b border-[#d8dde6] px-2 py-2">{column.label}</th>
                ))}
                <th className="border-b border-[#d8dde6] px-2 py-2">当前阶段</th>
                <th className="border-b border-[#d8dde6] px-2 py-2">操作</th>
                <th className="border-b border-[#d8dde6] px-2 py-2">查看订单</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const productFlow = productFlowByStatus[product.status];
                return (
                  <Fragment key={product.id}>
                    <tr className="align-top bg-white">
                      <td className="border-t border-[#d8dde6] px-2 py-2 font-semibold">{product.orderNo}</td>
                      <td className="border-t border-[#d8dde6] px-2 py-2">{product.customerName}</td>
                      <td className="border-t border-[#d8dde6] px-2 py-2 font-semibold">{product.productName}</td>
                      <td className="border-t border-[#d8dde6] px-2 py-2">{formatEmpty(product.specification)}</td>
                      <td className="border-t border-[#d8dde6] px-2 py-2">{product.quantity}</td>
                      <td className="border-t border-[#d8dde6] px-2 py-2 text-xs leading-5">
                        <div>材质：{formatEmpty(product.material)}</div>
                        <div>表面：{formatEmpty(product.surfaceTreatment)}</div>
                        <div>颜色：{product.colors.length ? product.colors.join("、") : "-"}</div>
                        <div>部件/图纸：{product.partCount}/{product.drawingCount}</div>
                        <div>外发/回厂/未回：{product.outsourcedTotal}/{product.returnedTotal}/{product.missingTotal}</div>
                      </td>
                      {flowColumns.map((column) => (
                        <td key={column.key} className="border-t border-[#d8dde6] px-2 py-2">
                          <FlowBadge value={productFlow[column.key]} />
                        </td>
                      ))}
                      <td className="border-t border-[#d8dde6] px-2 py-2 font-semibold">{getProductStatusLabel(product.status)}</td>
                      <td className="border-t border-[#d8dde6] px-2 py-2 text-[#667085]">由部件同步</td>
                      <td className="border-t border-[#d8dde6] px-2 py-2">
                        <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm font-medium text-[#344054] hover:bg-[#f6f7f9]" href={`/orders/${product.orderId}`}>
                          查看订单
                        </Link>
                      </td>
                    </tr>
                    {product.parts.length > 0 ? (
                      product.parts.map((part) => {
                        const flow = partFlow(part, product.status);
                        return (
                          <tr key={part.id} className="bg-[#fbfcfd] align-top text-xs">
                            <td className="border-t border-[#eef2f6] px-2 py-2 pl-6 text-[#475467]">{formatEmpty(part.partCode)}</td>
                            <td className="border-t border-[#eef2f6] px-2 py-2 font-medium">{part.partName}</td>
                            <td className="border-t border-[#eef2f6] px-2 py-2">{part.totalQuantity}</td>
                            <td className="border-t border-[#eef2f6] px-2 py-2">{part.drawingCount}</td>
                            <td className="border-t border-[#eef2f6] px-2 py-2">{part.outsourcedQuantity}</td>
                            <td className="border-t border-[#eef2f6] px-2 py-2">
                              <div>已回：{part.returnedQuantity}</div>
                              <div>未回：{part.missingQuantity}</div>
                              <div>{part.statusLabel}</div>
                            </td>
                            {flowColumns.map((column) => (
                              <td key={column.key} className="border-t border-[#eef2f6] px-2 py-2">
                                <FlowBadge value={flow[column.key]} />
                              </td>
                            ))}
                            <td className="border-t border-[#eef2f6] px-2 py-2">{part.statusLabel}</td>
                            <td className="border-t border-[#eef2f6] px-2 py-2">{renderPartAction(part)}</td>
                            <td className="border-t border-[#eef2f6] px-2 py-2 text-[#667085]">-</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr className="bg-[#fbfcfd] text-xs">
                        <td className="border-t border-[#eef2f6] px-2 py-3 pl-6 text-[#667085]" colSpan={15}>暂无部件</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {products.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-[#667085]" colSpan={15}>
                    暂无生产进度数据。
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
