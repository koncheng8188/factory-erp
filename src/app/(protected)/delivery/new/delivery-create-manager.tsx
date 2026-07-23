"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { todayInputValue } from "@/lib/delivery";
import { getProductStatusLabel } from "@/lib/product-status";

type ProductOption = {
  id: string;
  productName: string;
  specification: string | null;
  material: string | null;
  quantity: number;
  status: string;
  deliveredQuantity: number;
  missingQuantity: number;
  canDeliver: boolean;
};

type OrderOption = {
  id: string;
  orderNo: string;
  customerName: string;
  products: ProductOption[];
};

type DetailItem = ProductOption & {
  deliveryQuantity: number;
  remark: string;
};

type FormState = {
  deliveryDate: string;
  receiver: string;
  handler: string;
  remark: string;
};

type DeliveryCreateManagerProps = {
  orders: OrderOption[];
  initialOrderId: string;
  receiverSuggestions: string[];
  handlerSuggestions: string[];
};

export function DeliveryCreateManager({
  orders,
  initialOrderId,
  receiverSuggestions,
  handlerSuggestions
}: DeliveryCreateManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    deliveryDate: todayInputValue(),
    receiver: "",
    handler: "",
    remark: ""
  });
  const [selectedOrderId, setSelectedOrderId] = useState(initialOrderId);
  const [checkedProductIds, setCheckedProductIds] = useState<string[]>([]);
  const [quantityByProductId, setQuantityByProductId] = useState<Record<string, string>>({});
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );
  const deliverableProducts = selectedOrder?.products.filter((product) => product.canDeliver) ?? [];
  const isBusy = isSubmitting || isPending;

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function changeOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setCheckedProductIds([]);
    setQuantityByProductId({});
    setDetailItems([]);
    setMessage("");
    setError("");
  }

  function updateChecked(productId: string, checked: boolean) {
    setCheckedProductIds((current) => checked ? [...current, productId] : current.filter((id) => id !== productId));
  }

  function updateQuantity(productId: string, value: string) {
    setQuantityByProductId((current) => ({ ...current, [productId]: value }));
  }

  function addCheckedProducts() {
    setMessage("");
    setError("");

    if (!selectedOrder) {
      setError("请先选择订单。");
      return;
    }
    if (checkedProductIds.length === 0) {
      setError("请先勾选需要送货的产品。");
      return;
    }

    const nextItems = [...detailItems];
    for (const productId of checkedProductIds) {
      const product = deliverableProducts.find((item) => item.id === productId);
      if (!product) continue;

      const deliveryQuantity = Number(quantityByProductId[product.id] || "0");
      if (!Number.isInteger(deliveryQuantity) || deliveryQuantity <= 0) {
        setError(`产品「${product.productName}」本次送货数量必须大于 0。`);
        return;
      }
      if (deliveryQuantity > product.missingQuantity) {
        setError(`产品「${product.productName}」本次送货数量不能大于未送数量 ${product.missingQuantity}。`);
        return;
      }

      const existingIndex = nextItems.findIndex((item) => item.id === product.id);
      const nextItem = { ...product, deliveryQuantity, remark: "" };
      if (existingIndex >= 0) {
        nextItems[existingIndex] = { ...nextItems[existingIndex], deliveryQuantity };
      } else {
        nextItems.push(nextItem);
      }
    }

    setDetailItems(nextItems);
    setCheckedProductIds([]);
    setQuantityByProductId({});
    setMessage("已加入送货明细。");
  }

  function removeDetailItem(productId: string) {
    setDetailItems((current) => current.filter((item) => item.id !== productId));
  }

  function updateDetailRemark(productId: string, remark: string) {
    setDetailItems((current) => current.map((item) => item.id === productId ? { ...item, remark } : item));
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current || isSubmitting || isPending) return;

    setMessage("");
    setError("");

    if (!selectedOrder) {
      setError("请先选择订单。");
      return;
    }
    if (detailItems.length === 0) {
      setError("请至少加入一条送货明细。");
      return;
    }

    for (const item of detailItems) {
      if (!Number.isInteger(item.deliveryQuantity) || item.deliveryQuantity <= 0) {
        setError(`产品「${item.productName}」本次送货数量必须大于 0。`);
        return;
      }
      if (item.deliveryQuantity > item.missingQuantity) {
        setError(`产品「${item.productName}」本次送货数量不能大于未送数量 ${item.missingQuantity}。`);
        return;
      }
    }

    let succeeded = false;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          customerName: selectedOrder.customerName,
          ...form,
          items: detailItems.map((item) => ({
            productId: item.id,
            deliveryQuantity: item.deliveryQuantity,
            remark: item.remark
          }))
        })
      });
      const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查日志。" }));

      if (!response.ok) {
        setError(data.error ?? "保存送货单失败。");
        return;
      }

      succeeded = true;
      setMessage("送货单已保存。");
      startTransition(() => router.push(`/delivery/${data.deliveryOrder.id}`));
    } finally {
      if (!succeeded) {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  }

  return (
    <form className="space-y-6" onSubmit={submitForm}>
      <section>
        <h1 className="text-2xl font-semibold">新建送货单</h1>
        <p className="mt-2 text-sm text-[#667085]">选择订单和可送产品后创建送货单，支持同一订单分批送货。</p>
      </section>

      {message ? <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">送货单信息</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="block text-sm font-medium">
            订单 <span className="text-red-600">*</span>
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={selectedOrderId} onChange={(event) => changeOrder(event.target.value)}>
              <option value="">请选择订单</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>{order.orderNo} - {order.customerName}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            客户名称
            <input readOnly className="mt-1 w-full rounded-md border border-[#cfd6e1] bg-[#eef2f6] px-3 py-2" value={selectedOrder?.customerName ?? ""} />
          </label>
          <label className="block text-sm font-medium">
            送货日期
            <input type="date" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.deliveryDate} onChange={(event) => updateField("deliveryDate", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            收货人
            <input list="receiver-suggestions" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.receiver} onChange={(event) => updateField("receiver", event.target.value)} />
            <datalist id="receiver-suggestions">
              {receiverSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm font-medium">
            经手人
            <input list="delivery-handler-suggestions" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.handler} onChange={(event) => updateField("handler", event.target.value)} />
            <datalist id="delivery-handler-suggestions">
              {handlerSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm font-medium lg:col-span-3">
            备注
            <textarea className="mt-1 min-h-20 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.remark} onChange={(event) => updateField("remark", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">选择可送产品</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="bg-[#eef2f6] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-2">选择</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">规格</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">材质</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">订单数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">已送数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">未送数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-2">本次送货数量</th>
              </tr>
            </thead>
            <tbody>
              {deliverableProducts.map((product) => (
                <tr key={product.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-2">
                    <input type="checkbox" checked={checkedProductIds.includes(product.id)} onChange={(event) => updateChecked(product.id, event.target.checked)} />
                  </td>
                  <td className="border-b border-[#eef2f6] px-3 py-2 font-medium">{product.productName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-2">{product.specification || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-2">{product.material || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-2">{product.quantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-2">{product.deliveredQuantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-2">{product.missingQuantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-2">{getProductStatusLabel(product.status)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-2">
                    <input
                      type="number"
                      min="1"
                      max={product.missingQuantity}
                      step="1"
                      className="w-28 rounded-md border border-[#cfd6e1] px-2 py-1"
                      value={quantityByProductId[product.id] ?? ""}
                      onChange={(event) => updateQuantity(product.id, event.target.value)}
                    />
                  </td>
                </tr>
              ))}
              {!selectedOrder ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={9}>请选择订单。</td>
                </tr>
              ) : null}
              {selectedOrder && deliverableProducts.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={9}>该订单暂无可送产品。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <button type="button" className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium" onClick={addCheckedProducts}>
            加入送货明细
          </button>
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">送货明细</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">规格</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">材质</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">已送数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">未送数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">本次送货数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {detailItems.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{item.productName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.specification || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.material || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.quantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.deliveredQuantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.missingQuantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.deliveryQuantity}</td>
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
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={9}>请先选择并加入送货产品。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button className="rounded-md bg-[#172033] px-5 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isBusy}>
          {isSubmitting ? "正在保存..." : isPending ? "正在跳转..." : "保存送货单"}
        </button>
      </div>
    </form>
  );
}
