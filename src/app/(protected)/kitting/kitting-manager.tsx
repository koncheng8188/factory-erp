"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";

type KittingPart = {
  id: string;
  partName: string;
  partCode: string | null;
  totalQuantity: number;
  outsourcedQuantity: number;
  returnedQuantity: number;
  missingQuantity: number;
  status: string;
};

type MissingPart = {
  id: string;
  partName: string;
  partCode: string | null;
  missingQuantity: number;
};

type KittingProduct = {
  id: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  productName: string;
  specification: string | null;
  quantity: number;
  status: string;
  partCount: number;
  hasParts: boolean;
  isQuantityComplete: boolean;
  hasAbnormal: boolean;
  message: string;
  missingParts: MissingPart[];
  parts: KittingPart[];
};

function statusClass(product: KittingProduct) {
  if (!product.hasParts) return "border-amber-200 bg-amber-50 text-amber-800";
  if (product.hasAbnormal) return "border-red-200 bg-red-50 text-red-700";
  if (product.isQuantityComplete) return "border-green-200 bg-green-50 text-green-700";
  return "border-orange-200 bg-orange-50 text-orange-700";
}

function kittingLabel(product: KittingProduct) {
  if (!product.hasParts) return "未维护部件";
  if (product.hasAbnormal && product.isQuantityComplete) return "数量已齐但异常";
  if (product.hasAbnormal) return "存在异常";
  if (product.isQuantityComplete) return "已齐套";
  return "未齐套";
}

export function KittingManager({
  products,
  selectedProductId,
  canExecuteKitting
}: {
  products: KittingProduct[];
  selectedProductId: string | null;
  canExecuteKitting: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(selectedProductId ? [selectedProductId] : [])
  );
  const [checkingProductId, setCheckingProductId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function toggleExpanded(productId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  async function checkProduct(product: KittingProduct) {
    if (!canExecuteKitting) return;

    setMessage("");
    setError("");
    setCheckingProductId(product.id);

    const response = await fetch(`/api/kitting/${product.id}`, { method: "POST" });
    const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查日志。" }));

    setCheckingProductId(null);

    if (!response.ok) {
      setError(data.error ?? "齐套检查失败。");
      return;
    }

    setExpandedIds((current) => new Set(current).add(product.id));
    setMessage(data.message ?? "齐套检查完成。");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">齐套检查</h1>
        <p className="mt-2 text-sm text-[#667085]">按产品检查所有部件的应加工数量、已外发数量、已回数量和缺少数量。</p>
      </section>

      {message ? <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">客户名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品规格</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">是否齐套</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">缺件汇总</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const isExpanded = expandedIds.has(product.id);
                return (
                  <Fragment key={product.id}>
                    <tr className={selectedProductId === product.id ? "bg-[#fbfcfd]" : "align-top"}>
                      <td className="border-b border-[#eef2f6] px-3 py-3">
                        <Link className="font-medium text-[#172033] hover:underline" href={`/orders/${product.orderId}`}>
                          {product.orderNo}
                        </Link>
                      </td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">{product.customerName}</td>
                      <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{product.productName}</td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">{product.specification || "-"}</td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">{product.quantity}</td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">{product.status}</td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">{product.partCount}</td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">
                        <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${statusClass(product)}`}>
                          {kittingLabel(product)}
                        </span>
                      </td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">
                        <span className={product.hasAbnormal ? "font-medium text-red-700" : product.isQuantityComplete ? "font-medium text-green-700" : "font-medium text-orange-700"}>
                          {product.message}
                        </span>
                      </td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm"
                            type="button"
                            onClick={() => toggleExpanded(product.id)}
                          >
                            {isExpanded ? "收起明细" : "查看明细"}
                          </button>
                          {canExecuteKitting ? (
                            <button
                              className="rounded-md bg-[#172033] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                              type="button"
                              disabled={isPending || checkingProductId === product.id}
                              onClick={() => checkProduct(product)}
                            >
                              {checkingProductId === product.id ? "检查中" : "执行齐套检查"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr>
                        <td className="border-b border-[#d8dde6] bg-[#fbfcfd] px-3 py-4" colSpan={10}>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[840px] border-collapse text-left text-sm">
                              <thead className="bg-[#eef2f6] text-[#475467]">
                                <tr>
                                  <th className="border-b border-[#d8dde6] px-3 py-2">部件名称</th>
                                  <th className="border-b border-[#d8dde6] px-3 py-2">部件编号</th>
                                  <th className="border-b border-[#d8dde6] px-3 py-2">应加工数量</th>
                                  <th className="border-b border-[#d8dde6] px-3 py-2">已外发数量</th>
                                  <th className="border-b border-[#d8dde6] px-3 py-2">已回数量</th>
                                  <th className="border-b border-[#d8dde6] px-3 py-2">缺少数量</th>
                                  <th className="border-b border-[#d8dde6] px-3 py-2">部件状态</th>
                                </tr>
                              </thead>
                              <tbody>
                                {product.parts.map((part) => (
                                  <tr key={part.id}>
                                    <td className="border-b border-[#eef2f6] px-3 py-2 font-medium">{part.partName}</td>
                                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.partCode || "-"}</td>
                                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.totalQuantity}</td>
                                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.outsourcedQuantity}</td>
                                    <td className="border-b border-[#eef2f6] px-3 py-2">{part.returnedQuantity}</td>
                                    <td className={`border-b border-[#eef2f6] px-3 py-2 font-medium ${part.missingQuantity > 0 ? "text-orange-700" : "text-green-700"}`}>
                                      {part.missingQuantity}
                                    </td>
                                    <td className={part.status === "ABNORMAL" ? "border-b border-[#eef2f6] px-3 py-2 font-medium text-red-700" : "border-b border-[#eef2f6] px-3 py-2"}>
                                      {part.status}
                                    </td>
                                  </tr>
                                ))}
                                {product.parts.length === 0 ? (
                                  <tr>
                                    <td className="px-3 py-5 text-center text-[#667085]" colSpan={7}>未维护部件，不能判定为已齐套。</td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {products.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={10}>暂无产品。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
