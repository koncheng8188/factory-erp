"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getOrderStatusLabel, orderStatusOptions } from "@/lib/order-status";

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

type OrderFilters = {
  keyword: string;
  status: string;
  startDate: string;
  endDate: string;
};

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

export function OrderManager({
  orders,
  customers,
  filters,
  canCreateOrder,
  canUpdateOrder,
  canDeleteOrder
}: {
  orders: Order[];
  customers: Customer[];
  filters: OrderFilters;
  canCreateOrder: boolean;
  canUpdateOrder: boolean;
  canDeleteOrder: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [filterForm, setFilterForm] = useState<OrderFilters>(filters);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isEditing = Boolean(editingId);

  function updateField(field: keyof OrderForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateFilterField(field: keyof OrderFilters, value: string) {
    setFilterForm((current) => ({ ...current, [field]: value }));
  }

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const keyword = filterForm.keyword.trim();

    if (keyword) params.set("keyword", keyword);
    if (filterForm.status) params.set("status", filterForm.status);
    if (filterForm.startDate) params.set("startDate", filterForm.startDate);
    if (filterForm.endDate) params.set("endDate", filterForm.endDate);

    const queryString = params.toString();
    startTransition(() => router.push(queryString ? `/orders?${queryString}` : "/orders"));
  }

  function clearFilters() {
    setFilterForm({ keyword: "", status: "", startDate: "", endDate: "" });
    startTransition(() => router.push("/orders"));
  }

  function startEdit(order: Order) {
    if (!canUpdateOrder) return;
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

    if ((isEditing && !canUpdateOrder) || (!isEditing && !canCreateOrder)) {
      return;
    }

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
    if (!canDeleteOrder) return;
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

      {(isEditing ? canUpdateOrder : canCreateOrder) ? (
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
              {orderStatusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
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
      </section>
      ) : null}

      {message ? <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">订单列表</h2>
        <form className="mt-4 rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm" onSubmit={submitFilters}>
          <div className="grid gap-3 md:grid-cols-5">
            <label className="block text-sm font-medium md:col-span-2">
              关键词
              <input
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                placeholder="搜索订单号、客户名称、产品名称"
                value={filterForm.keyword}
                onChange={(event) => updateFilterField("keyword", event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              订单状态
              <select
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                value={filterForm.status}
                onChange={(event) => updateFilterField("status", event.target.value)}
              >
                <option value="">全部状态</option>
                {orderStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              开始日期
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                value={filterForm.startDate}
                onChange={(event) => updateFilterField("startDate", event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              结束日期
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
                value={filterForm.endDate}
                onChange={(event) => updateFilterField("endDate", event.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isPending}>
              搜索
            </button>
            <button type="button" className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium disabled:opacity-60" onClick={clearFilters} disabled={isPending}>
              清空筛选
            </button>
          </div>
        </form>
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
                  <td className="border-b border-[#eef2f6] px-3 py-3">{getOrderStatusLabel(order.status)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order._count.products}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{order.remark || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={`/orders/${order.id}`}>
                        详情
                      </Link>
                      {canUpdateOrder ? (
                        <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" onClick={() => startEdit(order)}>
                          编辑
                        </button>
                      ) : null}
                      {canDeleteOrder ? (
                        <button className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => deleteOrder(order)}>
                          删除
                        </button>
                      ) : null}
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
