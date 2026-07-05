"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { outsourceTypeOptions } from "@/lib/outsource";

type DrawingPreview = {
  id: string;
  thumbnailUrl: string | null;
  originalUrl: string;
  fileType: string | null;
};

type PartOption = {
  id: string;
  orderId: string;
  orderNo: string;
  productId: string;
  productName: string;
  partName: string;
  partCode: string | null;
  specification: string | null;
  material: string | null;
  surfaceTreatment: string | null;
  color: string | null;
  totalQuantity: number;
  outsourcedQuantity: number;
  returnedQuantity: number;
  status: string;
  drawing: DrawingPreview | null;
};

type ProductOption = {
  id: string;
  productName: string;
  specification: string | null;
  material: string | null;
  quantity: number;
  parts: PartOption[];
};

type OrderOption = {
  id: string;
  orderNo: string;
  customerName: string;
  products: ProductOption[];
};

type DetailItem = PartOption & {
  outsourceQuantity: number;
  remark: string;
};

type FormState = {
  supplierName: string;
  outsourceType: string;
  outsourceDate: string;
  expectedReturnDate: string;
  handler: string;
  remark: string;
};

function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function availableQuantity(part: PartOption) {
  return part.totalQuantity - part.outsourcedQuantity;
}

function renderDrawingPreview(drawing: DrawingPreview | null) {
  if (!drawing) {
    return (
      <div className="flex h-16 w-20 items-center justify-center rounded border border-[#d8dde6] bg-[#f6f7f9] text-xs text-[#667085]">
        无图
      </div>
    );
  }

  if (drawing.thumbnailUrl) {
    return <img className="h-16 w-20 rounded border border-[#d8dde6] object-contain" src={drawing.thumbnailUrl} alt="部件图纸缩略图" />;
  }

  return (
    <div className="flex h-16 w-20 items-center justify-center rounded border border-[#d8dde6] bg-[#eef2f6] text-xs font-semibold text-[#475467]">
      PDF
    </div>
  );
}

export function OutsourceCreateManager({ orders }: { orders: OrderOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>({
    supplierName: "",
    outsourceType: "ELECTROPLATING",
    outsourceDate: todayInputValue(),
    expectedReturnDate: "",
    handler: "",
    remark: ""
  });
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [checkedPartIds, setCheckedPartIds] = useState<string[]>([]);
  const [quantityByPartId, setQuantityByPartId] = useState<Record<string, string>>({});
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );
  const selectedProduct = useMemo(
    () => selectedOrder?.products.find((product) => product.id === selectedProductId) ?? null,
    [selectedOrder, selectedProductId]
  );

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function changeOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setSelectedProductId("");
    setCheckedPartIds([]);
    setQuantityByPartId({});
    setDetailItems([]);
    setMessage("");
    setError("");
  }

  function changeProduct(productId: string) {
    setSelectedProductId(productId);
    setCheckedPartIds([]);
    setQuantityByPartId({});
  }

  function updateChecked(partId: string, checked: boolean) {
    setCheckedPartIds((current) => checked ? [...current, partId] : current.filter((id) => id !== partId));
  }

  function updateQuantity(partId: string, value: string) {
    setQuantityByPartId((current) => ({ ...current, [partId]: value }));
  }

  function addCheckedParts() {
    setMessage("");
    setError("");

    if (!selectedProduct) {
      setError("请先选择产品。");
      return;
    }
    if (checkedPartIds.length === 0) {
      setError("请先勾选需要外发的部件。");
      return;
    }

    const nextItems = [...detailItems];
    for (const partId of checkedPartIds) {
      const part = selectedProduct.parts.find((item) => item.id === partId);
      if (!part) continue;

      const available = availableQuantity(part);
      const outsourceQuantity = Number(quantityByPartId[part.id] || "0");
      if (!Number.isInteger(outsourceQuantity) || outsourceQuantity <= 0) {
        setError(`部件「${part.partName}」本次外发数量必须大于 0。`);
        return;
      }
      if (available <= 0) {
        setError(`部件「${part.partName}」没有可外发数量。`);
        return;
      }
      if (outsourceQuantity > available) {
        setError(`部件「${part.partName}」本次外发数量不能大于可外发数量 ${available}。`);
        return;
      }

      const existingIndex = nextItems.findIndex((item) => item.id === part.id);
      const nextItem = { ...part, outsourceQuantity, remark: "" };
      if (existingIndex >= 0) {
        nextItems[existingIndex] = { ...nextItems[existingIndex], outsourceQuantity };
      } else {
        nextItems.push(nextItem);
      }
    }

    setDetailItems(nextItems);
    setCheckedPartIds([]);
    setQuantityByPartId({});
    setMessage("已加入外发明细。");
  }

  function removeDetailItem(partId: string) {
    setDetailItems((current) => current.filter((item) => item.id !== partId));
  }

  function updateDetailRemark(partId: string, remark: string) {
    setDetailItems((current) => current.map((item) => item.id === partId ? { ...item, remark } : item));
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!form.supplierName.trim()) {
      setError("外发厂家不能为空。");
      return;
    }
    if (detailItems.length === 0) {
      setError("请至少加入一个外发明细。");
      return;
    }

    for (const item of detailItems) {
      const available = availableQuantity(item);
      if (!Number.isInteger(item.outsourceQuantity) || item.outsourceQuantity <= 0) {
        setError(`部件「${item.partName}」本次外发数量必须大于 0。`);
        return;
      }
      if (item.outsourceQuantity > available) {
        setError(`部件「${item.partName}」本次外发数量不能大于可外发数量 ${available}。`);
        return;
      }
    }

    const response = await fetch("/api/outsourcing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        items: detailItems.map((item) => ({
          partId: item.id,
          outsourceQuantity: item.outsourceQuantity,
          remark: item.remark
        }))
      })
    });
    const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查日志。" }));

    if (!response.ok) {
      setError(data.error ?? "保存外发单失败。");
      return;
    }

    setMessage("外发单已保存。");
    startTransition(() => router.push(`/outsourcing/${data.outsourceOrder.id}`));
  }

  return (
    <form className="space-y-6" onSubmit={submitForm}>
      <section>
        <h1 className="text-2xl font-semibold">新建外发单</h1>
        <p className="mt-2 text-sm text-[#667085]">选择订单、产品和部件后创建外发记录。</p>
      </section>

      {message ? <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">外发单信息</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="block text-sm font-medium">
            外发厂家 <span className="text-red-600">*</span>
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.supplierName} onChange={(event) => updateField("supplierName", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            外发类型
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.outsourceType} onChange={(event) => updateField("outsourceType", event.target.value)}>
              {outsourceTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            外发日期
            <input type="date" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.outsourceDate} onChange={(event) => updateField("outsourceDate", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            预计回厂日期
            <input type="date" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.expectedReturnDate} onChange={(event) => updateField("expectedReturnDate", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            经手人
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.handler} onChange={(event) => updateField("handler", event.target.value)} />
          </label>
          <label className="block text-sm font-medium lg:col-span-3">
            备注
            <textarea className="mt-1 min-h-20 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.remark} onChange={(event) => updateField("remark", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">选择外发部件</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block text-sm font-medium">
            订单
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={selectedOrderId} onChange={(event) => changeOrder(event.target.value)}>
              <option value="">请选择订单</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>{order.orderNo} - {order.customerName}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            产品
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={selectedProductId} onChange={(event) => changeProduct(event.target.value)} disabled={!selectedOrder}>
              <option value="">请选择产品</option>
              {selectedOrder?.products.map((product) => (
                <option key={product.id} value={product.id}>{product.productName}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1460px] border-collapse text-left text-sm">
            <thead className="bg-[#eef2f6] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-2">选择</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">图纸</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">部件名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">部件编号</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">规格</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">材质</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">表面处理</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">颜色</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">应加工数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">已外发数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">已回数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">可外发数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">本次外发数量</th>
              </tr>
            </thead>
            <tbody>
              {selectedProduct?.parts.map((part) => {
                const available = availableQuantity(part);
                const disabled = available <= 0;
                return (
                  <tr key={part.id} className="align-top">
                    <td className="border-b border-[#eef2f6] px-3 py-2">
                      <input type="checkbox" checked={checkedPartIds.includes(part.id)} disabled={disabled} onChange={(event) => updateChecked(part.id, event.target.checked)} />
                    </td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{renderDrawingPreview(part.drawing)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.orderNo}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.productName}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2 font-medium">{part.partName}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.partCode || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.specification || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.material || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.surfaceTreatment || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.color || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.totalQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.outsourcedQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.returnedQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{available}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        max={Math.max(available, 1)}
                        step="1"
                        className="w-28 rounded-md border border-[#cfd6e1] px-2 py-1 disabled:bg-[#eef2f6]"
                        disabled={disabled}
                        value={quantityByPartId[part.id] ?? ""}
                        onChange={(event) => updateQuantity(part.id, event.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
              {!selectedProduct ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={15}>请选择订单和产品。</td>
                </tr>
              ) : null}
              {selectedProduct && selectedProduct.parts.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={15}>该产品暂无部件。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <button type="button" className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium" onClick={addCheckedParts}>
            加入外发明细
          </button>
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">外发明细</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">图纸</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">可外发数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">本次外发数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">明细备注</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {detailItems.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3">{renderDrawingPreview(item.drawing)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.orderNo}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.productName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{item.partName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{availableQuantity(item)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.outsourceQuantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <input className="w-56 rounded-md border border-[#cfd6e1] px-2 py-1" value={item.remark} onChange={(event) => updateDetailRemark(item.id, event.target.value)} />
                  </td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <button type="button" className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => removeDetailItem(item.id)}>
                      移除
                    </button>
                  </td>
                </tr>
              ))}
              {detailItems.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={8}>请先选择并加入外发部件。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button className="rounded-md bg-[#172033] px-5 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isPending}>
          保存外发单
        </button>
      </div>
    </form>
  );
}
