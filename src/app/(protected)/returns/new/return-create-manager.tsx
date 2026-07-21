"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { formatDisplayDate, outsourceTypeLabels, type OutsourceTypeValue } from "@/lib/outsource";
import { todayInputValue } from "@/lib/returns";

type ReturnOrderItem = {
  id: string;
  productName: string;
  partName: string;
  partCode: string | null;
  specification: string | null;
  material: string | null;
  surfaceTreatment: string | null;
  color: string | null;
  outsourceQuantity: number;
  returnedQuantity: number;
  missingQuantity: number;
  thumbnailUrl: string | null;
  originalUrl: string | null;
  drawing: {
    fileType: string | null;
  } | null;
};

type ReturnOrder = {
  id: string;
  outsourceNo: string;
  supplierName: string;
  outsourceType: string;
  outsourceDate: string;
  expectedReturnDate: string | null;
  status: string;
  handler: string | null;
  remark: string | null;
  items: ReturnOrderItem[];
};

type ItemInput = {
  returnQuantity: string;
  abnormalQuantity: string;
  abnormalReason: string;
  remark: string;
};

type FormState = {
  returnDate: string;
  handler: string;
  remark: string;
};

function typeLabel(type: string) {
  return outsourceTypeLabels[type as OutsourceTypeValue] ?? type;
}

function parseInputQuantity(value: string) {
  if (value.trim() === "") return 0;
  const quantity = Number(value);
  return Number.isInteger(quantity) ? quantity : Number.NaN;
}

function renderDrawingPreview(item: ReturnOrderItem) {
  if (item.thumbnailUrl) {
    return <img className="h-16 w-20 rounded border border-[#d8dde6] object-contain" src={item.thumbnailUrl} alt="图纸缩略图" />;
  }
  if (item.originalUrl) {
    return (
      <div className="flex h-16 w-20 items-center justify-center rounded border border-[#d8dde6] bg-[#eef2f6] text-xs font-semibold text-[#475467]">
        {item.drawing?.fileType?.toLowerCase() === "pdf" ? "PDF" : "图纸"}
      </div>
    );
  }
  return (
    <div className="flex h-16 w-20 items-center justify-center rounded border border-[#d8dde6] bg-[#f6f7f9] text-xs text-[#667085]">
      无图
    </div>
  );
}

export function ReturnCreateManager({
  outsourceOrder,
  canCreateOutsourceReturn
}: {
  outsourceOrder: ReturnOrder;
  canCreateOutsourceReturn: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>({
    returnDate: todayInputValue(),
    handler: "",
    remark: ""
  });
  const [items, setItems] = useState<Record<string, ItemInput>>(() =>
    Object.fromEntries(
      outsourceOrder.items.map((item) => [
        item.id,
        {
          returnQuantity: "",
          abnormalQuantity: "",
          abnormalReason: "",
          remark: ""
        }
      ])
    )
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  function updateForm(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateItem(itemId: string, field: keyof ItemInput, value: string) {
    setItems((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        [field]: value
      }
    }));
  }

  function validateItems() {
    let hasReturn = false;
    for (const orderItem of outsourceOrder.items) {
      const input = items[orderItem.id];
      const returnQuantity = parseInputQuantity(input?.returnQuantity ?? "");
      const abnormalQuantity = parseInputQuantity(input?.abnormalQuantity ?? "");

      if (!Number.isInteger(returnQuantity) || returnQuantity < 0) {
        return `部件「${orderItem.partName}」本次回来数量必须是大于等于 0 的整数。`;
      }
      if (!Number.isInteger(abnormalQuantity) || abnormalQuantity < 0) {
        return `部件「${orderItem.partName}」异常数量必须是大于等于 0 的整数。`;
      }
      const physicalQuantity = returnQuantity + abnormalQuantity;
      if (orderItem.missingQuantity <= 0 && physicalQuantity > 0) {
        return `部件「${orderItem.partName}」已经全部回齐，不能继续登记。`;
      }
      if (physicalQuantity > orderItem.missingQuantity) {
        return `部件「${orderItem.partName}」本次回来数量不能大于未回数量 ${orderItem.missingQuantity}。`;
      }
      if (abnormalQuantity > 0 && !input.abnormalReason.trim()) {
        return `部件「${orderItem.partName}」有异常数量时必须填写异常原因。`;
      }
      if (physicalQuantity > 0) {
        hasReturn = true;
      }
    }

    return hasReturn ? "" : "请至少填写一条本次回来数量大于 0 的明细。";
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateOutsourceReturn) return;
    if (isSubmitting || submittingRef.current) return;

    setMessage("");
    setError("");

    const validationError = validateItems();
    if (validationError) {
      setError(validationError);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outsourceOrderId: outsourceOrder.id,
          ...form,
          items: outsourceOrder.items.map((item) => ({
            outsourceOrderItemId: item.id,
            returnQuantity: parseInputQuantity(items[item.id]?.returnQuantity ?? ""),
            abnormalQuantity: parseInputQuantity(items[item.id]?.abnormalQuantity ?? ""),
            abnormalReason: items[item.id]?.abnormalReason ?? "",
            remark: items[item.id]?.remark ?? ""
          })).filter((item) => item.returnQuantity + item.abnormalQuantity > 0)
        })
      });
      const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查日志。" }));
      if (!response.ok) {
        setError(data.error ?? "保存回厂记录失败。");
        return;
      }
      setMessage("回厂记录已保存。");
      startTransition(() => router.push(`/outsourcing/${outsourceOrder.id}`));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={submitForm}>
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">外发回厂登记</h1>
          <p className="mt-2 text-sm text-[#667085]">按外发明细登记本次实际回厂数量，支持同一外发单分批回厂。</p>
        </div>
        {canCreateOutsourceReturn ? (
          <button className="rounded-md bg-[#172033] px-5 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isSubmitting || isPending}>
            保存回厂记录
          </button>
        ) : null}
      </section>

      {message ? <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">外发单信息</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[#667085]">外发单号</dt><dd className="mt-1 font-medium">{outsourceOrder.outsourceNo}</dd></div>
          <div><dt className="text-[#667085]">外发厂家</dt><dd className="mt-1 font-medium">{outsourceOrder.supplierName}</dd></div>
          <div><dt className="text-[#667085]">外发类型</dt><dd className="mt-1">{typeLabel(outsourceOrder.outsourceType)}</dd></div>
          <div><dt className="text-[#667085]">外发日期</dt><dd className="mt-1">{formatDisplayDate(outsourceOrder.outsourceDate)}</dd></div>
          <div><dt className="text-[#667085]">预计回厂日期</dt><dd className="mt-1">{formatDisplayDate(outsourceOrder.expectedReturnDate)}</dd></div>
          <div><dt className="text-[#667085]">状态</dt><dd className="mt-1">{outsourceOrder.status}</dd></div>
          <div><dt className="text-[#667085]">经手人</dt><dd className="mt-1">{outsourceOrder.handler || "-"}</dd></div>
          <div className="sm:col-span-2 lg:col-span-4"><dt className="text-[#667085]">备注</dt><dd className="mt-1">{outsourceOrder.remark || "-"}</dd></div>
        </dl>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">回厂信息</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="block text-sm font-medium">
            回厂日期
            <input type="date" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.returnDate} onChange={(event) => updateForm("returnDate", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            经手人
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.handler} onChange={(event) => updateForm("handler", event.target.value)} />
          </label>
          <label className="block text-sm font-medium lg:col-span-3">
            备注
            <textarea className="mt-1 min-h-20 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.remark} onChange={(event) => updateForm("remark", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">回厂明细</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1680px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">图纸</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件编号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">规格</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">材质</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">表面处理</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">颜色</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">外发数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">已回数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">未回数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">本次回来数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">异常数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">异常原因</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
              </tr>
            </thead>
            <tbody>
              {outsourceOrder.items.map((item) => {
                const disabled = item.missingQuantity <= 0;
                const input = items[item.id];
                return (
                  <tr key={item.id} className="align-top">
                    <td className="border-b border-[#eef2f6] px-3 py-3">{renderDrawingPreview(item)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.productName}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{item.partName}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.partCode || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.specification || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.material || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.surfaceTreatment || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.color || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.outsourceQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.returnedQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{item.missingQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">
                      <input
                        type="number"
                        min="0"
                        max={item.missingQuantity}
                        step="1"
                        className="w-28 rounded-md border border-[#cfd6e1] px-2 py-1 disabled:bg-[#eef2f6]"
                        disabled={disabled}
                        value={input?.returnQuantity ?? ""}
                        onChange={(event) => updateItem(item.id, "returnQuantity", event.target.value)}
                      />
                    </td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="w-28 rounded-md border border-[#cfd6e1] px-2 py-1 disabled:bg-[#eef2f6]"
                        disabled={disabled}
                        value={input?.abnormalQuantity ?? ""}
                        onChange={(event) => updateItem(item.id, "abnormalQuantity", event.target.value)}
                      />
                    </td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">
                      <input
                        className="w-52 rounded-md border border-[#cfd6e1] px-2 py-1 disabled:bg-[#eef2f6]"
                        disabled={disabled}
                        value={input?.abnormalReason ?? ""}
                        onChange={(event) => updateItem(item.id, "abnormalReason", event.target.value)}
                      />
                    </td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">
                      <input
                        className="w-52 rounded-md border border-[#cfd6e1] px-2 py-1 disabled:bg-[#eef2f6]"
                        disabled={disabled}
                        value={input?.remark ?? ""}
                        onChange={(event) => updateItem(item.id, "remark", event.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
              {outsourceOrder.items.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={15}>该外发单暂无明细。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </form>
  );
}
