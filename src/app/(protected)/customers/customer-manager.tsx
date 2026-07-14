"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Customer = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  remark: string | null;
  _count: { orders: number };
};

type CustomerForm = {
  name: string;
  contact: string;
  phone: string;
  address: string;
  remark: string;
};

const emptyForm: CustomerForm = {
  name: "",
  contact: "",
  phone: "",
  address: "",
  remark: ""
};

export function CustomerManager({
  customers,
  canCreateCustomer,
  canUpdateCustomer,
  canDeleteCustomer
}: {
  customers: Customer[];
  canCreateCustomer: boolean;
  canUpdateCustomer: boolean;
  canDeleteCustomer: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isEditing = Boolean(editingId);

  function updateField(field: keyof CustomerForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(customer: Customer) {
    if (!canUpdateCustomer) return;
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      contact: customer.contact ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      remark: customer.remark ?? ""
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if ((isEditing && !canUpdateCustomer) || (!isEditing && !canCreateCustomer)) {
      return;
    }

    if (!form.name.trim()) {
      setError("客户名称不能为空。");
      return;
    }

    const url = isEditing ? `/api/customers/${editingId}` : "/api/customers";
    const method = isEditing ? "PUT" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? "保存失败，请稍后重试。");
      return;
    }

    setMessage(isEditing ? "客户已保存。" : "客户已新增。");
    resetForm();
    startTransition(() => router.refresh());
  }

  async function deleteCustomer(customer: Customer) {
    if (!canDeleteCustomer) return;
    if (!window.confirm(`确认删除客户“${customer.name}”吗？`)) {
      return;
    }

    setMessage("");
    setError("");
    const response = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? "删除失败，请稍后重试。");
      return;
    }

    setMessage("客户已删除。");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">客户管理</h1>
        <p className="mt-2 text-sm text-[#667085]">维护客户资料、联系人、电话和地址。</p>
      </section>

      {(isEditing ? canUpdateCustomer : canCreateCustomer) ? (
        <section className="rounded-md border border-[#d8dde6] bg-white p-5">
          <h2 className="text-lg font-semibold">{isEditing ? "编辑客户" : "新增客户"}</h2>
          <form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={submitForm}>
          <label className="block text-sm font-medium">
            客户名称 <span className="text-red-600">*</span>
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.name} onChange={(event) => updateField("name", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            联系人
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.contact} onChange={(event) => updateField("contact", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            电话
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            地址
            <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.address} onChange={(event) => updateField("address", event.target.value)} />
          </label>
          <label className="block text-sm font-medium lg:col-span-2">
            备注
            <textarea className="mt-1 min-h-20 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={form.remark} onChange={(event) => updateField("remark", event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3 lg:col-span-2">
            <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isPending}>
              {isEditing ? "保存客户" : "新增客户"}
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
      ) : null}

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">客户列表</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">客户名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">联系人</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">电话</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">地址</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单数</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{customer.name}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{customer.contact || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{customer.phone || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{customer.address || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{customer._count.orders}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{customer.remark || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <div className="flex gap-2">
                      {canUpdateCustomer ? (
                        <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" onClick={() => startEdit(customer)}>
                          编辑
                        </button>
                      ) : null}
                      {canDeleteCustomer ? (
                        <button className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => deleteCustomer(customer)}>
                          删除
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={7}>
                    暂无客户，请先新增客户。
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
