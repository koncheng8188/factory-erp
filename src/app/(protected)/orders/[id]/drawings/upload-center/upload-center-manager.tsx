"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type UploadOrder = {
  id: string;
  orderNo: string;
  customerName: string;
  products: UploadProduct[];
};

type UploadProduct = {
  id: string;
  productName: string;
  specification: string | null;
  material: string | null;
  quantity: number;
  parts: UploadPart[];
};

type UploadPart = {
  id: string;
  productId: string;
  productName: string;
  partName: string;
  partCode: string | null;
  specification: string | null;
  material: string | null;
  existingDrawingCount: number;
};

type LocalDrawingStatus = "pending" | "assigned" | "uploading" | "success" | "error";

type LocalDrawingFile = {
  localId: string;
  file: File;
  fileName: string;
  fileType: string;
  fileSize: number;
  assignedPartId: string | null;
  status: LocalDrawingStatus;
  errorMessage: string | null;
  previewUrl: string;
  isImage: boolean;
  isPdf: boolean;
};

type UploadSummary = {
  success: number;
  failed: number;
  unassigned: number;
};

const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const imageMimeTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function extensionFor(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function isImageFile(file: File) {
  const extension = extensionFor(file.name);
  return imageMimeTypes.has(file.type) || ["jpg", "jpeg", "png", "webp"].includes(extension);
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || extensionFor(file.name) === "pdf";
}

function isAllowedFile(file: File) {
  const extension = extensionFor(file.name);
  return allowedExtensions.has(extension) && (!file.type || allowedMimeTypes.has(file.type));
}

function readableFileType(file: File) {
  return file.type || extensionFor(file.name).toUpperCase() || "未知";
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function statusText(status: LocalDrawingStatus) {
  const labels: Record<LocalDrawingStatus, string> = {
    pending: "未分配",
    assigned: "已分配",
    uploading: "上传中",
    success: "成功",
    error: "失败"
  };

  return labels[status];
}

async function parseResponseError(response: Response) {
  const data = await response.json().catch(() => null);
  if (data && typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }

  return `上传失败，HTTP ${response.status}`;
}

export function UploadCenterManager({ order }: { order: UploadOrder }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef<LocalDrawingFile[]>([]);
  const [files, setFiles] = useState<LocalDrawingFile[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [previewFile, setPreviewFile] = useState<LocalDrawingFile | null>(null);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewFile(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      filesRef.current.forEach((file) => URL.revokeObjectURL(file.previewUrl));
    };
  }, []);

  const flatParts = useMemo(() => order.products.flatMap((product) => product.parts), [order.products]);
  const partById = useMemo(() => new Map(flatParts.map((part) => [part.id, part])), [flatParts]);

  const selectedCount = files.length;
  const assignedCount = files.filter((file) => file.assignedPartId).length;
  const unassignedCount = selectedCount - assignedCount;
  const successCount = files.filter((file) => file.status === "success").length;
  const failedCount = files.filter((file) => file.status === "error").length;
  const uploadableCount = files.filter((file) => file.assignedPartId && file.status !== "success" && file.status !== "uploading").length;

  function assignFile(localId: string, partId: string | null) {
    setFiles((current) =>
      current.map((item) => {
        if (item.localId !== localId || item.status === "uploading" || item.status === "success") {
          return item;
        }

        return {
          ...item,
          assignedPartId: partId,
          status: partId ? "assigned" : "pending",
          errorMessage: null
        };
      })
    );
  }

  function removeFile(localId: string) {
    setFiles((current) => {
      const target = current.find((item) => item.localId === localId);
      if (!target || target.status === "uploading") {
        return current;
      }

      URL.revokeObjectURL(target.previewUrl);
      if (previewFile?.localId === localId) {
        setPreviewFile(null);
      }

      return current.filter((item) => item.localId !== localId);
    });
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    const validFiles = selectedFiles.filter(isAllowedFile);
    const invalidFiles = selectedFiles.filter((file) => !isAllowedFile(file));

    setSelectionError(
      invalidFiles.length > 0
        ? `已跳过不支持的文件：${invalidFiles.map((file) => file.name).join("，")}。仅支持 JPG、JPEG、PNG、WEBP、PDF。`
        : ""
    );
    setSummary(null);

    if (validFiles.length > 0) {
      setFiles((current) => [
        ...current,
        ...validFiles.map((file) => ({
          localId: createLocalId(),
          file,
          fileName: file.name,
          fileType: readableFileType(file),
          fileSize: file.size,
          assignedPartId: null,
          status: "pending" as const,
          errorMessage: null,
          previewUrl: URL.createObjectURL(file),
          isImage: isImageFile(file),
          isPdf: isPdfFile(file)
        }))
      ]);
    }

    event.target.value = "";
  }

  function handleDragStart(event: React.DragEvent, localId: string) {
    event.dataTransfer.setData("text/plain", localId);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(event: React.DragEvent, partId: string) {
    event.preventDefault();
    const localId = event.dataTransfer.getData("text/plain");
    if (localId) {
      assignFile(localId, partId);
    }
  }

  async function uploadOneFile(item: LocalDrawingFile) {
    if (!item.assignedPartId) {
      return { ok: false, error: "文件未分配部件。" };
    }

    const formData = new FormData();
    formData.append("files", item.file);
    const response = await fetch(`/api/parts/${item.assignedPartId}/drawings`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      return { ok: false, error: await parseResponseError(response) };
    }

    return { ok: true, error: null };
  }

  async function confirmUpload() {
    const targets = files.filter((file) => file.assignedPartId && file.status !== "success");
    if (targets.length === 0 || isUploading) {
      return;
    }

    setIsUploading(true);
    setSummary(null);
    setCurrentIndex(0);
    setUploadTotal(targets.length);

    let success = 0;
    let failed = 0;

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      setCurrentIndex(index + 1);
      setFiles((current) =>
        current.map((item) =>
          item.localId === target.localId ? { ...item, status: "uploading", errorMessage: null } : item
        )
      );

      try {
        const result = await uploadOneFile(target);
        if (result.ok) {
          success += 1;
          setFiles((current) =>
            current.map((item) =>
              item.localId === target.localId ? { ...item, status: "success", errorMessage: null } : item
            )
          );
        } else {
          failed += 1;
          setFiles((current) =>
            current.map((item) =>
              item.localId === target.localId ? { ...item, status: "error", errorMessage: result.error } : item
            )
          );
        }
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "上传失败。";
        setFiles((current) =>
          current.map((item) =>
            item.localId === target.localId ? { ...item, status: "error", errorMessage: message } : item
          )
        );
      }
    }

    const latestUnassigned = files.filter((file) => !file.assignedPartId).length;
    setSummary({ success, failed, unassigned: latestUnassigned });
    setIsUploading(false);
  }

  function renderPreviewThumb(item: LocalDrawingFile, sizeClass = "h-20 w-24") {
    if (item.isImage) {
      return (
        <button className={`${sizeClass} shrink-0 rounded border border-[#d8dde6] bg-[#fbfcfd] p-1`} type="button" onClick={() => setPreviewFile(item)}>
          <img className="h-full w-full object-contain" src={item.previewUrl} alt={item.fileName} />
        </button>
      );
    }

    return (
      <button
        className={`${sizeClass} shrink-0 rounded border border-[#d8dde6] bg-[#eef2f6] text-xs font-semibold text-[#475467]`}
        type="button"
        onClick={() => setPreviewFile(item)}
      >
        PDF
      </button>
    );
  }

  function renderPreviewModal() {
    if (!previewFile) {
      return null;
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-[#d8dde6] px-4 py-3">
            <h2 className="min-w-0 truncate text-base font-semibold">{previewFile.fileName}</h2>
            <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" onClick={() => setPreviewFile(null)}>
              关闭
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {previewFile.isImage ? (
              <img className="mx-auto max-h-[78vh] max-w-full object-contain" src={previewFile.previewUrl} alt={previewFile.fileName} />
            ) : (
              <div className="space-y-2">
                <object className="h-[78vh] w-full rounded border border-[#d8dde6]" data={previewFile.previewUrl} type="application/pdf">
                  <iframe className="h-[78vh] w-full rounded border border-[#d8dde6]" src={previewFile.previewUrl} title={previewFile.fileName} />
                </object>
                <p className="text-sm text-[#667085]">如果浏览器无法直接预览 PDF，请使用系统 PDF 查看器打开文件查看。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderAssignedFile(item: LocalDrawingFile) {
    return (
      <div
        key={item.localId}
        className="flex items-center gap-2 rounded border border-[#d8dde6] bg-white p-2 text-xs"
        draggable={!isUploading && item.status !== "success"}
        onDragStart={(event) => handleDragStart(event, item.localId)}
      >
        {renderPreviewThumb(item, "h-16 w-20")}
        <div className="min-w-0 flex-1">
          <button className="block max-w-full truncate text-left font-medium hover:underline" type="button" onClick={() => setPreviewFile(item)}>
            {item.fileName}
          </button>
          <div className="mt-1 text-[#667085]">{statusText(item.status)}</div>
          <button className="mt-1 rounded border border-[#cfd6e1] px-2 py-0.5 text-xs" type="button" onClick={() => setPreviewFile(item)}>
            {item.isPdf ? "预览 PDF" : "预览"}
          </button>
        </div>
        <button className="shrink-0 text-[#b42318] disabled:opacity-50" disabled={isUploading || item.status === "success"} onClick={() => assignFile(item.localId, null)}>
          移除分配
        </button>
      </div>
    );
  }

  function renderFileRow(item: LocalDrawingFile) {
    const assignedPart = item.assignedPartId ? partById.get(item.assignedPartId) : null;

    return (
      <div
        key={item.localId}
        className="rounded-md border border-[#d8dde6] bg-white p-3 shadow-sm"
        draggable={!isUploading && item.status !== "success"}
        onDragStart={(event) => handleDragStart(event, item.localId)}
      >
        <div className="flex gap-3">
          {renderPreviewThumb(item)}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="break-words font-medium">{item.fileName}</div>
                <div className="mt-1 text-xs text-[#667085]">
                  {formatFileSize(item.fileSize)} / {item.fileType}
                </div>
              </div>
              <span className="shrink-0 rounded bg-[#eef2f6] px-2 py-1 text-xs text-[#475467]">{statusText(item.status)}</span>
            </div>

            <div className="mt-3 grid gap-2">
              <select
                className="w-full rounded-md border border-[#cfd6e1] px-2 py-1.5 text-sm disabled:bg-[#f6f7f9]"
                value={item.assignedPartId ?? ""}
                disabled={isUploading || item.status === "success"}
                onChange={(event) => assignFile(item.localId, event.target.value || null)}
              >
                <option value="">未分配</option>
                {flatParts.map((part) => (
                  <option key={part.id} value={part.id}>
                    {part.productName} / {part.partName}
                  </option>
                ))}
              </select>

              <div className="text-xs text-[#667085]">
                当前分配：{assignedPart ? `${assignedPart.productName} / ${assignedPart.partName}` : "未分配"}
              </div>

              {item.errorMessage ? <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{item.errorMessage}</div> : null}

              <div className="flex flex-wrap gap-2">
                <button className="rounded-md border border-[#cfd6e1] px-2 py-1 text-xs" type="button" onClick={() => setPreviewFile(item)}>
                  {item.isPdf ? "预览 PDF" : "预览"}
                </button>
                {item.assignedPartId && item.status !== "success" ? (
                  <button className="rounded-md border border-[#cfd6e1] px-2 py-1 text-xs disabled:opacity-50" disabled={isUploading} onClick={() => assignFile(item.localId, null)}>
                    取消分配
                  </button>
                ) : null}
                <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50" disabled={isUploading || item.status === "success"} onClick={() => removeFile(item.localId)}>
                  移除
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-[#d8dde6] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1 text-sm">
            <div>
              <span className="text-[#667085]">当前订单号：</span>
              <span className="font-medium">{order.orderNo}</span>
            </div>
            <div>
              <span className="text-[#667085]">客户名称：</span>
              <span className="font-medium">{order.customerName}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex items-center justify-center rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-semibold hover:bg-[#eef2f6]" href={`/orders/${order.id}`}>
              返回订单详情
            </Link>
            <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
              选择图纸
            </button>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileSelection}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-5">
          <div className="rounded-md bg-[#eef2f6] px-3 py-2 text-[#475467]">已选择：{selectedCount} 个</div>
          <div className="rounded-md bg-[#ecfdf3] px-3 py-2 text-[#027a48]">已分配：{assignedCount} 个</div>
          <div className="rounded-md bg-[#fff7ed] px-3 py-2 text-[#b54708]">未分配：{unassignedCount} 个</div>
          <div className="rounded-md bg-[#ecfdf3] px-3 py-2 text-[#027a48]">上传成功：{successCount} 个</div>
          <div className="rounded-md bg-red-50 px-3 py-2 text-red-700">上传失败：{failedCount} 个</div>
        </div>
        {unassignedCount > 0 ? <div className="mt-3 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">未分配文件不会上传。</div> : null}
        {selectionError ? <div className="mt-3 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">{selectionError}</div> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="space-y-4">
          {order.products.map((product) => (
            <div key={product.id} className="rounded-md border border-[#d8dde6] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef2f6] pb-3">
                <div>
                  <h2 className="font-semibold">产品：{product.productName}</h2>
                  <div className="mt-1 text-xs text-[#667085]">
                    规格：{product.specification || "-"} / 材质：{product.material || "-"} / 数量：{product.quantity}
                  </div>
                </div>
                <span className="rounded bg-[#eef2f6] px-2 py-1 text-xs text-[#475467]">部件 {product.parts.length} 个</span>
              </div>

              <div className="mt-3 grid gap-3">
                {product.parts.map((part) => {
                  const assignedFiles = files.filter((file) => file.assignedPartId === part.id);
                  return (
                    <div
                      key={part.id}
                      className="rounded-md border border-dashed border-[#cfd6e1] bg-[#fbfcfd] p-3"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDrop(event, part.id)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{part.partName}</div>
                          <div className="mt-1 text-xs text-[#667085]">
                            部件编号：{part.partCode || "-"} / 规格：{part.specification || "-"} / 材质：{part.material || "-"}
                          </div>
                          <div className="mt-1 text-xs font-medium text-[#475467]">
                            {part.existingDrawingCount > 0 ? `已有图纸：${part.existingDrawingCount} 张` : "暂无图纸"}
                          </div>
                        </div>
                        <div className="text-right text-xs text-[#667085]">
                          <div className="font-semibold text-[#172033]">本次已分配 {assignedFiles.length} 张</div>
                          <div>拖图纸到这里</div>
                        </div>
                      </div>

                      {assignedFiles.length > 0 ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {assignedFiles.map(renderAssignedFile)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {product.parts.length === 0 ? <div className="rounded-md bg-[#fbfcfd] px-3 py-4 text-center text-sm text-[#667085]">该产品暂无部件。</div> : null}
              </div>
            </div>
          ))}
          {order.products.length === 0 ? <div className="rounded-md border border-[#d8dde6] bg-white px-3 py-6 text-center text-sm text-[#667085]">当前订单暂无产品。</div> : null}
        </div>

        <aside className="rounded-md border border-[#d8dde6] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">待分配图纸文件池</h2>
            <span className="rounded bg-[#eef2f6] px-2 py-1 text-xs text-[#475467]">{files.length} 个文件</span>
          </div>

          <button
            className="mt-3 w-full rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isUploading || uploadableCount === 0}
            onClick={confirmUpload}
          >
            {isUploading ? "上传中" : "确认上传已分配图纸"}
          </button>

          {isUploading ? (
            <div className="mt-3 rounded-md bg-[#eef2f6] px-3 py-2 text-sm text-[#475467]">
              上传进度：{currentIndex} / {uploadTotal}
            </div>
          ) : null}

          {summary ? (
            <div className="mt-3 rounded-md bg-[#f6f7f9] px-3 py-2 text-sm">
              上传结果：成功 {summary.success}，失败 {summary.failed}，未分配 {summary.unassigned}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            {files.map(renderFileRow)}
            {files.length === 0 ? (
              <div className="rounded-md bg-[#fbfcfd] px-3 py-8 text-center text-sm text-[#667085]">
                暂无文件，请点击“选择图纸”。
              </div>
            ) : null}
          </div>
        </aside>
      </section>
      {renderPreviewModal()}
    </div>
  );
}
