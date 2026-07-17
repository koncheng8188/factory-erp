"use client";

import type { ProductPartStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const restoreStatusOptions: { value: Exclude<ProductPartStatus, "ABNORMAL">; label: string }[] = [
  { value: "PENDING", label: "待生产" },
  { value: "CUTTING", label: "下料中" },
  { value: "WELDING", label: "焊接中" },
  { value: "POLISHING", label: "抛光中" },
  { value: "WAIT_OUTSOURCE", label: "待外发" },
  { value: "OUTSOURCING", label: "外发中" },
  { value: "PARTIAL_RETURN", label: "部分回厂" },
  { value: "RETURNED", label: "已回厂" }
];

type AbnormalResolveActionsProps = {
  productPartId: string;
  fromStatus: ProductPartStatus;
  canResolveProductionAbnormal: boolean;
};

function defaultRestoreStatus(status: ProductPartStatus): Exclude<ProductPartStatus, "ABNORMAL"> {
  return status === "ABNORMAL" ? "PENDING" : status;
}

export function AbnormalResolveActions({
  productPartId,
  fromStatus,
  canResolveProductionAbnormal
}: AbnormalResolveActionsProps) {
  const router = useRouter();
  const [restoreStatus, setRestoreStatus] = useState<Exclude<ProductPartStatus, "ABNORMAL">>(defaultRestoreStatus(fromStatus));
  const [resolvedRemark, setResolvedRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function resolveAbnormal() {
    if (!canResolveProductionAbnormal) return;

    setError("");

    if (resolvedRemark.trim().length > 500) {
      setError("处理备注不能超过 500 字。");
      return;
    }

    setSubmitting(true);
    const response = await fetch(`/api/parts/${productPartId}/abnormal/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        restoreStatus,
        resolvedRemark
      })
    });
    const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查服务端日志。" }));

    setSubmitting(false);

    if (!response.ok) {
      setError(data.error ?? "处理生产异常失败。");
      return;
    }

    router.refresh();
  }

  if (!canResolveProductionAbnormal) return null;

  return (
    <div className="min-w-56 space-y-2">
      <select
        className="w-full rounded-md border border-[#cfd6e1] px-2 py-1.5 text-sm"
        value={restoreStatus}
        onChange={(event) => setRestoreStatus(event.target.value as Exclude<ProductPartStatus, "ABNORMAL">)}
      >
        {restoreStatusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <textarea
        className="min-h-16 w-full rounded-md border border-[#cfd6e1] px-2 py-1.5 text-sm"
        maxLength={500}
        value={resolvedRemark}
        onChange={(event) => setResolvedRemark(event.target.value)}
        placeholder="处理备注，可选"
      />
      {error ? <div className="text-xs font-medium text-red-700">{error}</div> : null}
      <button
        className="w-full rounded-md bg-[#172033] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#344054] hover:text-white disabled:opacity-60"
        type="button"
        disabled={submitting}
        onClick={resolveAbnormal}
      >
        {submitting ? "处理中" : "处理完成"}
      </button>
    </div>
  );
}
