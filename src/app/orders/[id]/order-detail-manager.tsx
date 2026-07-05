"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Customer = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
};

type Product = {
  id: string;
  productName: string;
  specification: string | null;
  material: string | null;
  quantity: number;
  surfaceTreatment: string | null;
  status: string;
  remark: string | null;
};

type OrderDetail = {
  id: string;
  orderNo: string;
  customerId: string;
  customerName: string;
  orderDate: Date;
  deliveryDate: Date | null;
  status: string;
  remark: string | null;
  customer: Customer;
  products: Product[];
};

type OrderForm = {
  customerId: string;
  orderDate: string;
  deliveryDate: string;
  status: string;
  remark: string;
};

type ProductForm = {
  productName: string;
  specification: string;
  material: string;
  quantity: string;
  surfaceTreatment: string;
  remark: string;
};

const orderStatuses = ["PENDING", "PRODUCING", "OUTSOURCING", "WAIT_DELIVERY", "PARTIAL_DELIVERED", "COMPLETED", "ABNORMAL"];

const emptyProductForm: ProductForm = {
  productName: "",
  specification: "",
  material: "",
  quantity: "1",
  surfaceTreatment: "",
  remark: ""
};

function toDateInputValue(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDate(value: Date | string | null) {
  const input = toDateInputValue(value);
  return input || "-";
}

export function OrderDetailManager({ order, customers }: { order: OrderDetail; customers: Customer[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [orderForm, setOrderForm] = useState<OrderForm>({
    customerId: order.customerId,
    orderDate: toDateInputValue(order.orderDate),
    deliveryDate: toDateInputValue(order.deliveryDate),
    status: order.status,
    remark: order.remark ?? ""
  });
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateOrderField(field: keyof OrderForm, value: string) {
    setOrderForm((current) => ({ ...current, [field]: value }));
  }

  function updateProductField(field: keyof ProductForm, value: string) {
    setProductForm((current) => ({ ...current, [field]: value }));
  }

  function refreshWithMessage(nextMessage: string) {
    setMessage(nextMessage);
    startTransition(() => router.refresh());
  }

  async function saveOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!orderForm.customerId) {
      setError("订单必须选择客户。");
      return;
    }

    const response = await fetch(`/api/orders/${order.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderForm)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? "保存订单失败。");
      return;
    }

    refreshWithMessage("订单基本信息已保存。");
  }

  function startEditProduct(product: Product) {
    setEditingProductId(product.id);
    setProductForm({
      productName: product.productName,
      specification: product.specification ?? "",
      material: product.material ?? "",
      quantity: String(product.quantity),
      surfaceTreatment: product.surfaceTreatment ?? "",
      remark: product.remark ?? ""
    });
    setMessage("");
    setError("");
  }

  function resetProductForm() {
    setEditingProductId(null);
    setProductForm(emptyProductForm);
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!productForm.productName.trim()) {
      setError("产品名称不能为空。");
      return;
    }

    if (Number(productForm.quantity) <= 0) {
      setError("产品数量必须大于 0。");
      return;
    }

    const response = await fetch(editingProductId ? `/api/products/${editingProductId}` : `/api/orders/${order.id}/products`, {
      method: editingProductId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productForm)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? "保存产品失败。");
      return;
    }

    resetProductForm();
    refreshWithMessage(editingProductId ? "产品已保存。" : "产品已新增。");
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`确认删除产品“${product.productName}”吗？`)) {
      return;
    }

    setMessage("");
    setError("");
    const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? "删除产品失败。");
      return;
    }

    refreshWithMessage("产品已删除。");
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">订单详情：{order.orderNo}</h1>
        <p className="mt-2 text-sm text-[#667085]">查看订单、客户和产品明细。</p>
      </section>

      {message ? <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-md border border-[#d8dde6] bg-white p-5">
          <h2 className="text-lg font-semibold">订单基本信息</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-[#667085]">订单号</dt><dd className="mt-1 font-medium">{order.orderNo}</dd></div>
            <div><dt className="text-[#667085]">客户名称</dt><dd className="mt-1 font-medium">{order.customerName}</dd></div>
            <div><dt className="text-[#667085]">下单日期</dt><dd className="mt-1">{formatDate(order.orderDate)}</dd></div>
            <div><dt className="text-[#667085]">交货日期</dt><dd className="mt-1">{formatDate(order.deliveryDate)}</dd></div>
            <div><dt className="text-[#667085]">订单状态</dt><dd className="mt-1">{order.status}</dd></div>
            <div><dt className="text-[#667085]">备注</dt><dd className="mt-1">{order.remark || "-"}</dd></div>
          </dl>
        </div>

        <div className="rounded-md border border-[#d8dde6] bg-white p-5">
          <h2 className="text-lg font-semibold">客户信息</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-[#667085]">客户名称</dt><dd className="mt-1 font-medium">{order.customer.name}</dd></div>
            <div><dt className="text-[#667085]">联系人</dt><dd className="mt-1">{order.customer.contact || "-"}</dd></div>
            <div><dt className="text-[#667085]">电话</dt><dd className="mt-1">{order.customer.phone || "-"}</dd></div>
            <div><dt className="text-[#667085]">地址</dt><dd className="mt-1">{order.customer.address || "-"}</dd></div>
          </dl>
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">编辑订单基本信息</h2>
        <form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={saveOrder}>
          <label className="block text-sm font-medium">
            客户 <span className="text-red-600">*</span>
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={orderForm.customerId} onChange={(event) => updateOrderField("customerId", event.target.value)}>
              <option value="">请选择客户</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            下单日期
            <input type="date" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={orderForm.orderDate} onChange={(event) => updateOrderField("orderDate", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            交货日期
            <input type="date" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={orderForm.deliveryDate} onChange={(event) => updateOrderField("deliveryDate", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            订单状态
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={orderForm.status} onChange={(event) => updateOrderField("status", event.target.value)}>
              {orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium lg:col-span-2">
            备注
            <textarea className="mt-1 min-h-20 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={orderForm.remark} onChange={(event) => updateOrderField("remark", event.target.value)} />
          </label>
          <div className="lg:col-span-2">
            <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isPending}>保存订单</button>
          </div>
        </form>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">{editingProductId ? "编辑产品" : "新增产品"}</h2>
        <form className="mt-4 grid gap-4 lg:grid-cols-3" onSubmit={saveProduct}>
          <label className="block text-sm font-medium">
            产品名称 <span className="text-red-600">*</span>
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={productForm.productName} onChange={(event) => updateProductField("productName", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            规格
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={productForm.specification} onChange={(event) => updateProductField("specification", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            材质
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={productForm.material} onChange={(event) => updateProductField("material", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            数量 <span className="text-red-600">*</span>
            <input type="number" min="1" step="1" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={productForm.quantity} onChange={(event) => updateProductField("quantity", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            表面处理
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={productForm.surfaceTreatment} onChange={(event) => updateProductField("surfaceTreatment", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            备注
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={productForm.remark} onChange={(event) => updateProductField("remark", event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3 lg:col-span-3">
            <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isPending}>{editingProductId ? "保存产品" : "新增产品"}</button>
            {editingProductId ? <button type="button" className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium" onClick={resetProductForm}>取消编辑</button> : null}
          </div>
        </form>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">产品明细表</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">规格</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">材质</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">表面处理</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {order.products.map((product) => (
                <tr key={product.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{product.productName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.specification || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.material || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.quantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.surfaceTreatment || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.status}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.remark || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <div className="flex gap-2">
                      <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" onClick={() => startEditProduct(product)}>编辑</button>
                      <button className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => deleteProduct(product)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {order.products.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={8}>暂无产品，请先新增产品。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
