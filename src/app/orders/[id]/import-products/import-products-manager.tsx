"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type PreviewPart = {
  partName: string;
  partCode: string;
  unitQuantity: number;
  productQuantity: number;
  totalQuantity: number;
  specification: string;
  material: string;
  surfaceTreatment: string;
  color: string;
};

type PreviewProduct = {
  rowNumber: number;
  productCode: string;
  productName: string;
  specification: string;
  material: string;
  quantity: number | null;
  surfaceTreatment: string;
  color: string;
  remark: string;
  partList: string;
  parts: PreviewPart[];
  errors: string[];
  warnings: string[];
};

type PreviewRow = {
  rowNumber: number;
  productName: string;
  specification: string;
  material: string;
  quantity: string;
  surfaceTreatment: string;
  color: string;
  remark: string;
  partList: string;
};

type PreviewResult = {
  products: PreviewProduct[];
  rows: PreviewRow[];
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: Array<{ rowNumber: number; message: string }>;
  summary: {
    rowCount: number;
    productCount: number;
    partCount: number;
    errorCount: number;
    warningCount: number;
  };
  canConfirm: boolean;
};

type ImportResult = {
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

export function ImportProductsManager({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedFileText = useMemo(() => {
    if (!file) return "未选择文件";
    return `${file.name}，${Math.ceil(file.size / 1024)} KB`;
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
      const response = await fetch(`/api/orders/${orderId}/import-products/preview`, {
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
      const response = await fetch(`/api/orders/${orderId}/import-products/confirm`, {
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
      setMessage("导入成功，正在返回订单详情。");
      router.push(`/orders/${orderId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">导入文件</h2>
            <p className="mt-1 text-sm text-[#667085]">请使用简易模板整理数据，单个文件最大 5MB。</p>
          </div>
          <a
            className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium hover:bg-[#eef2f6]"
            href={`/api/orders/${orderId}/import-products/template`}
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
        {result ? (
          <div className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            已新增产品 {result.newProductCount} 个，部件 {result.newPartCount} 个。
          </div>
        ) : null}
      </section>

      {preview ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatBox label="数据行" value={preview.summary.rowCount} />
            <StatBox label="产品" value={preview.summary.productCount} />
            <StatBox label="部件" value={preview.summary.partCount} />
            <StatBox label="错误" value={preview.summary.errorCount} />
            <StatBox label="警告" value={preview.summary.warningCount} />
          </section>

          {preview.errors.length > 0 ? (
            <section className="rounded-md border border-red-200 bg-red-50 p-5">
              <h2 className="text-lg font-semibold text-red-800">错误</h2>
              <ul className="mt-3 space-y-1 text-sm text-red-700">
                {preview.errors.map((item, index) => (
                  <li key={`${item.rowNumber}-${index}`}>第 {item.rowNumber} 行：{item.message}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {preview.warnings.length > 0 ? (
            <section className="rounded-md border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-lg font-semibold text-amber-800">警告</h2>
              <ul className="mt-3 space-y-1 text-sm text-amber-700">
                {preview.warnings.map((item, index) => (
                  <li key={`${item.rowNumber}-${index}`}>第 {item.rowNumber} 行：{item.message}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-md border border-[#d8dde6] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">预览</h2>
              <button
                type="button"
                className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={isPending || !preview.canConfirm}
                onClick={confirmImport}
              >
                确认导入
              </button>
            </div>
            <div className="mt-4 space-y-5">
              {preview.products.map((product) => (
                <div key={product.rowNumber} className="rounded-md border border-[#d8dde6]">
                  <div className="grid gap-3 border-b border-[#eef2f6] bg-[#f6f7f9] px-4 py-3 text-sm lg:grid-cols-4">
                    <div><span className="text-[#667085]">行号：</span>{product.rowNumber}</div>
                    <div><span className="text-[#667085]">产品：</span>{product.productName || "-"}</div>
                    <div><span className="text-[#667085]">数量：</span>{product.quantity ?? "-"}</div>
                    <div><span className="text-[#667085]">产品序号：</span>{product.productCode}</div>
                    <div><span className="text-[#667085]">规格：</span>{product.specification || "-"}</div>
                    <div><span className="text-[#667085]">材质：</span>{product.material || "-"}</div>
                    <div><span className="text-[#667085]">表面处理：</span>{product.surfaceTreatment || "-"}</div>
                    <div><span className="text-[#667085]">颜色：</span>{product.color || "-"}</div>
                  </div>
                  {product.errors.length > 0 ? (
                    <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
                      {product.errors.join("；")}
                    </div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                      <thead className="bg-white text-[#475467]">
                        <tr>
                          <th className="border-b border-[#eef2f6] px-3 py-2">部件编号</th>
                          <th className="border-b border-[#eef2f6] px-3 py-2">部件名称</th>
                          <th className="border-b border-[#eef2f6] px-3 py-2">单套用量</th>
                          <th className="border-b border-[#eef2f6] px-3 py-2">产品数量</th>
                          <th className="border-b border-[#eef2f6] px-3 py-2">应加工数量</th>
                          <th className="border-b border-[#eef2f6] px-3 py-2">规格</th>
                          <th className="border-b border-[#eef2f6] px-3 py-2">材质</th>
                          <th className="border-b border-[#eef2f6] px-3 py-2">表面处理</th>
                          <th className="border-b border-[#eef2f6] px-3 py-2">颜色</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.parts.map((part) => (
                          <tr key={part.partCode}>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{part.partCode}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2 font-medium">{part.partName}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{part.unitQuantity}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{part.productQuantity}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{part.totalQuantity}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{part.specification || "-"}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{part.material || "-"}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{part.surfaceTreatment || "-"}</td>
                            <td className="border-b border-[#eef2f6] px-3 py-2">{part.color || "-"}</td>
                          </tr>
                        ))}
                        {product.parts.length === 0 ? (
                          <tr>
                            <td className="px-3 py-6 text-center text-[#667085]" colSpan={9}>暂无可导入部件</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
