"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Customer = {
  id: string;
  name: string;
};

type Order = {
  id: string;
  orderNo: string;
  customerId: string;
  customerName: string;
  orderDate: Date;
  deliveryDate: Date | null;
  status: string;
  remark: string | null;
  _count: { products: number };
};

type OrderForm = {
  customerId: string;
  orderDate: string;
  deliveryDate: string;
  status: string;
  remark: string;
};

const orderStatuses = ["PENDING", "PRODUCING", "OUTSOURCING", "WAIT_DELIVERY", "PARTIAL_DELIVERED", "COMPLETED", "ABNORMAL"];

function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

function emptyForm(): OrderForm {
  return {
    customerId: "",
    orderDate: todayInputValue(),
    deliveryDate: "",
    status: "PENDING",
    remark: ""
  };
}

export function OrderManager({ orders, customers }: { orders: Order[]; customers: Customer[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isEditing = Boolean(editingId);

  function updateField(field: keyof OrderForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(order: Order) {
    setEditingId(order.id);
    setForm({
      customerId: order.customerId,
      orderDate: toDateInputValue(order.orderDate),
      deliveryDate: toDateInputValue(order.deliveryDate),
      status: order.status,
      remark: order.remark ?? ""
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!form.customerId) {
      setError("订单必须选择客户。");
      return;
    }

    const response = await fetch(isEditing ? `/api/orders/${editingId}` : "/api/orders", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? "保存订单失败。");
      return;
    }

    setMessage(isEditing ? "订单已保存。" : `订单已新增，订单号：${data.order?.orderNo ?? ""}`);
    resetForm();
    startTransition(() => router.refresh());
  }

  async function deleteOrder(order: Order) {
    if (!window.confirm(`确认删除订单“${order.orderNo}”吗？`)) {
      return;
    }

    setMessage("");
    setError("");
    const response = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? "删除订单失败。");
      return;
    }

    setMessage("订单已删除。");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">订单管理</h1>
        <p className="mt-2 text-sm text-[#667085]">建立客户订单，维护交货日期、状态和备注。</p>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">{isEditing ? "编辑订单" : "新增订单"}</h2>
        <form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={submitForm}>
          <label className="block text-sm font-medium">
            客户 <span className="text-red-600">*</span>
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.customerId} onChange={(event) => updateField("customerId", event.target.value)}>
              <option value="">请选择客户</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            下单日期
            <input type="date" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.orderDate} onChange={(event) => updateField("orderDate", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            交货日期
            <input type="date" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.deliveryDate} onChange={(event) => updateField("deliveryDate", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            订单状态
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.status} onChange={(event) => updateField("status", event.target.value)}>
              {orderStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium lg:col-span-2">
            备注
            <textarea className="mt-1 min-h-20 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.remark} onChange={(event) => updateField("remark", event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3 lg:col-span-2">
            <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isPending}>
              {isEditing ? "保存订单" : "新增订单"}
            </button>
            {isEditing ? (
              <button type="button" className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium" onClick={resetForm}>
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
        {message ? <div className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
        {error ? <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">订单列表</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">客户名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">下单日期</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">交货日期</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品数</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{order.orderNo}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order.customerName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{formatDate(order.orderDate)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{formatDate(order.deliveryDate)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order.status}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order._count.products}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order.remark || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={`/orders/${order.id}`}>
                        详情
                      </Link>
                      <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" onClick={() => startEdit(order)}>
                        编辑
                      </button>
                      <button className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => deleteOrder(order)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={8}>
                    暂无订单，请先新增订单。
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
