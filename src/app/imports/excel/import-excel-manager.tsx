"use client";

import { useMemo, useState, useTransition } from "react";

type PreviewRow = {
  rowNumber: number;
  orderGroup: string;
  productGroup: string;
  customerName: string;
  orderNo: string;
  orderDate: string;
  deliveryDate: string;
  productName: string;
  productQuantity: string;
  partName: string;
  partCode: string;
  unitQuantity: string;
  partProductQuantity: string;
  totalQuantity: number | null;
  errors: string[];
  warnings: string[];
};

type PreviewResult = {
  rows: PreviewRow[];
  groups: Array<{
    orderGroup: string;
    customerName: string;
    orderNo: string;
    productCount: number;
    partCount: number;
  }>;
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: Array<{ rowNumber: number; message: string }>;
  summary: {
    rowCount: number;
    orderCount: number;
    productCount: number;
    partCount: number;
    newCustomerCount: number;
    reusedCustomerCount: number;
    errorCount: number;
    warningCount: number;
  };
  canConfirm: boolean;
};

type ImportResult = {
  newCustomerCount: number;
  reusedCustomerCount: number;
  newOrderCount: number;
  newProductCount: number;
  newPartCount: number;
};

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#d8dde6] bg-white px-4 py-3">
      <div className="text-xs text-[#667085]">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

export function ImportExcelManager() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedFileText = useMemo(() => {
    if (!file) return "未选择文件";
    return `${file.name}（${Math.ceil(file.size / 1024)} KB）`;
  }, [file]);

  async function parsePreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPreview(null);
    setResult(null);

    if (!file) {
      setError("请先选择 .xlsx 文件。");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const response = await fetch("/api/imports/excel/preview", {
        method: "POST",
        body: formData
      });
      const data = await response.json().catch(() => ({ error: "服务器返回了非 JSON 错误。" }));

      if (!response.ok) {
        setError(data.error ?? "解析预览失败。");
        return;
      }

      setPreview(data);
      setMessage(data.canConfirm ? "解析完成，可以确认导入。" : "解析完成，请先修正错误后重新上传。");
    });
  }

  function confirmImport() {
    if (!preview || !preview.canConfirm) return;
    setError("");
    setMessage("");
    setResult(null);

    startTransition(async () => {
      const response = await fetch("/api/imports/excel/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows })
      });
      const data = await response.json().catch(() => ({ error: "服务器返回了非 JSON 错误。" }));

      if (!response.ok) {
        setError(data.error ?? "确认导入失败。");
        return;
      }

      setResult(data.result);
      setMessage("导入成功。");
    });
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">Excel 导入</h1>
        <p className="mt-2 text-sm text-[#667085]">批量导入客户、订单、产品和部件。上传后先解析预览，确认无误后才写入系统。</p>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">导入文件</h2>
            <p className="mt-1 text-sm text-[#667085]">请使用系统模板整理数据，单个文件最大 5MB。</p>
          </div>
          <a
            className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium hover:bg-[#eef2f6]"
            href="/api/imports/excel/template"
          >
            下载 Excel 模板
          </a>
        </div>

        <form className="mt-4 flex flex-wrap items-center gap-3" onSubmit={parsePreview}>
          <input
            className="w-full max-w-md rounded-md border border-[#cfd6e1] px-3 py-2 text-sm"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isPending}>
            解析预览
          </button>
          <span className="text-sm text-[#667085]">{selectedFileText}</span>
        </form>

        {message ? <div className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
        {error ? <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      </section>

      {preview ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <StatBox label="数据行" value={preview.summary.rowCount} />
            <StatBox label="订单" value={preview.summary.orderCount} />
            <StatBox label="产品" value={preview.summary.productCount} />
            <StatBox label="部件" value={preview.summary.partCount} />
            <StatBox label="新增客户" value={preview.summary.newCustomerCount} />
            <StatBox label="复用客户" value={preview.summary.reusedCustomerCount} />
            <StatBox label="错误" value={preview.summary.errorCount} />
            <StatBox label="警告" value={preview.summary.warningCount} />
          </section>

          <section className="rounded-md border border-[#d8dde6] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">订单分组预览</h2>
              <button
                className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={!preview.canConfirm || isPending}
                onClick={confirmImport}
              >
                确认导入
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                <thead className="bg-[#f6f7f9] text-[#475467]">
                  <tr>
                    <th className="border-b border-[#d8dde6] px-3 py-3">订单分组</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">客户名称</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">产品数</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">部件数</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.groups.map((group) => (
                    <tr key={group.orderGroup}>
                      <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{group.orderGroup}</td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">{group.customerName}</td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">{group.orderNo}</td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">{group.productCount}</td>
                      <td className="border-b border-[#eef2f6] px-3 py-3">{group.partCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border border-[#d8dde6] bg-white p-5">
            <h2 className="text-lg font-semibold">数据行预览</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
                <thead className="bg-[#f6f7f9] text-[#475467]">
                  <tr>
                    <th className="border-b border-[#d8dde6] px-3 py-3">行号</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">订单分组</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">产品分组</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">客户</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">下单日期</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">交货日期</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">产品</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">产品数量</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">部件</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">部件编号</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">单套用量</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">部件产品数量</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">应加工数量</th>
                    <th className="border-b border-[#d8dde6] px-3 py-3">校验信息</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => {
                    const hasError = row.errors.length > 0;
                    const hasWarning = row.warnings.length > 0;
                    const rowClass = hasError ? "bg-red-50 align-top" : hasWarning ? "bg-yellow-50 align-top" : "align-top";

                    return (
                      <tr key={`${row.rowNumber}-${row.orderGroup}-${row.productGroup}`} className={rowClass}>
                        <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{row.rowNumber}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.orderGroup}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.productGroup}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.customerName}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.orderNo || "自动生成"}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.orderDate || "-"}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.deliveryDate || "-"}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.productName}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.productQuantity}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.partName || "-"}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.partCode || "-"}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.unitQuantity || "-"}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.partProductQuantity || "-"}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">{row.totalQuantity ?? "-"}</td>
                        <td className="border-b border-[#eef2f6] px-3 py-3">
                          {row.errors.map((item) => <div key={item} className="text-red-700">{item}</div>)}
                          {row.warnings.map((item) => <div key={item} className="text-yellow-700">{item}</div>)}
                          {!hasError && !hasWarning ? <span className="text-green-700">通过</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {result ? (
        <section className="rounded-md border border-green-200 bg-green-50 p-5">
          <h2 className="text-lg font-semibold text-green-800">导入结果</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatBox label="新增客户" value={result.newCustomerCount} />
            <StatBox label="复用客户" value={result.reusedCustomerCount} />
            <StatBox label="新增订单" value={result.newOrderCount} />
            <StatBox label="新增产品" value={result.newProductCount} />
            <StatBox label="新增部件" value={result.newPartCount} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
