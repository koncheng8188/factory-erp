"use client";

import type { ProductPartStatus, ProductStatus } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { getProductPartStatusLabel } from "@/lib/product-part-status";
import { getProductStatusLabel } from "@/lib/product-status";
import {
  badge,
  buttonPrimary,
  card,
  cardTitle,
  pageDescription,
  table,
  tableCell,
  tableHead,
  tableHeaderCell,
  tableRow,
  tableWrapper
} from "@/lib/ui-styles";

type Customer = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
};

type ProductPart = {
  id: string;
  partName: string;
  partCode: string | null;
  specification: string | null;
  material: string | null;
  unitQuantity: number;
  productQuantity: number;
  totalQuantity: number;
  surfaceTreatment: string | null;
  color: string | null;
  outsourcedQuantity: number;
  returnedQuantity: number;
  missingQuantity: number;
  status: ProductPartStatus;
  remark: string | null;
  drawings: PartDrawing[];
};

type PartDrawing = {
  id: string;
  fileName: string;
  fileType: string | null;
  originalUrl: string;
  thumbnailUrl: string | null;
  printThumbnailUrl: string | null;
  version: number;
  isMain: boolean;
  status: string;
  uploadStatus: string;
  errorMessage: string | null;
  remark: string | null;
};

type Product = {
  id: string;
  productName: string;
  specification: string | null;
  material: string | null;
  quantity: number;
  surfaceTreatment: string | null;
  status: ProductStatus;
  remark: string | null;
  parts: ProductPart[];
};

type OrderDetail = {
  id: string;
  orderNo: string;
  customerId: string;
  customerName: string;
  orderDate: Date | string;
  deliveryDate: Date | string | null;
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

type PartForm = {
  partName: string;
  partCode: string;
  specification: string;
  material: string;
  unitQuantity: string;
  productQuantity: string;
  surfaceTreatment: string;
  color: string;
  remark: string;
};

const orderStatuses = ["PENDING", "PRODUCING", "OUTSOURCING", "WAIT_DELIVERY", "PARTIAL_DELIVERED", "COMPLETED", "ABNORMAL"];
const drawingStatuses = ["PENDING", "CONFIRMED", "OBSOLETE"];

const emptyProductForm: ProductForm = {
  productName: "",
  specification: "",
  material: "",
  quantity: "1",
  surfaceTreatment: "",
  remark: ""
};

function emptyPartForm(productQuantity = 1): PartForm {
  return {
    partName: "",
    partCode: "",
    specification: "",
    material: "",
    unitQuantity: "1",
    productQuantity: String(productQuantity),
    surfaceTreatment: "",
    color: "",
    remark: ""
  };
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

function calculatedTotalQuantity(form: PartForm) {
  const unitQuantity = Number(form.unitQuantity);
  const productQuantity = Number(form.productQuantity);
  if (!Number.isInteger(unitQuantity) || !Number.isInteger(productQuantity)) {
    return 0;
  }
  return unitQuantity * productQuantity;
}

type FlowState = "未开始" | "进行中" | "已完成" | "待外发" | "外发中" | "已外发" | "部分回厂" | "已回厂" | "待送货" | "部分送货" | "异常";

type ProgressFlow = {
  cutting: FlowState;
  welding: FlowState;
  polishing: FlowState;
  outsourcing: FlowState;
  returning: FlowState;
  delivery: FlowState;
};

const progressFlowColumns: { key: keyof ProgressFlow; label: string }[] = [
  { key: "cutting", label: "下料" },
  { key: "welding", label: "焊接" },
  { key: "polishing", label: "抛光" },
  { key: "outsourcing", label: "外发" },
  { key: "returning", label: "回厂" },
  { key: "delivery", label: "送货" }
];

function formatEmpty(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

function getPartProductionFlow(partStatus: string, productStatus: string): ProgressFlow {
  let cutting: FlowState = "未开始";
  let welding: FlowState = "未开始";
  let polishing: FlowState = "未开始";
  let outsourcing: FlowState = "未开始";
  let returning: FlowState = "未开始";

  if (partStatus === "PENDING" || partStatus === "CUTTING") {
    cutting = "进行中";
  } else if (partStatus === "WELDING") {
    cutting = "已完成";
    welding = "进行中";
  } else if (partStatus === "POLISHING") {
    cutting = "已完成";
    welding = "已完成";
    polishing = "进行中";
  } else if (partStatus === "WAIT_OUTSOURCE") {
    cutting = "已完成";
    welding = "已完成";
    polishing = "已完成";
    outsourcing = "待外发";
  } else if (partStatus === "OUTSOURCING") {
    cutting = "已完成";
    welding = "已完成";
    polishing = "已完成";
    outsourcing = "外发中";
  } else if (partStatus === "PARTIAL_RETURN") {
    cutting = "已完成";
    welding = "已完成";
    polishing = "已完成";
    outsourcing = "已外发";
    returning = "部分回厂";
  } else if (partStatus === "RETURNED") {
    cutting = "已完成";
    welding = "已完成";
    polishing = "已完成";
    outsourcing = "已外发";
    returning = "已回厂";
  } else if (partStatus === "ABNORMAL") {
    cutting = "异常";
    welding = "异常";
    polishing = "异常";
    outsourcing = "异常";
    returning = "异常";
  }

  let delivery: FlowState = "未开始";
  if (productStatus === "WAIT_DELIVERY") delivery = "待送货";
  if (productStatus === "PARTIAL_DELIVERED") delivery = "部分送货";
  if (productStatus === "COMPLETED") delivery = "已完成";
  if (productStatus === "ABNORMAL") delivery = "异常";

  return { cutting, welding, polishing, outsourcing, returning, delivery };
}

function progressStatusClass(value: FlowState) {
  if (value === "已完成" || value === "已回厂" || value === "已外发") return "border-green-200 bg-green-50 text-green-700";
  if (value === "进行中" || value === "外发中") return "border-blue-200 bg-blue-50 text-blue-700";
  if (value === "待外发" || value === "待送货" || value === "部分回厂" || value === "部分送货") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "异常") return "border-red-200 bg-red-50 text-red-700";
  return "border-[#d8dde6] bg-[#f6f7f9] text-[#667085]";
}

function ProgressBadge({ value }: { value: FlowState }) {
  return (
    <span className={`${badge} ${progressStatusClass(value)}`}>
      {value}
    </span>
  );
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
  const [activePartProductId, setActivePartProductId] = useState<string | null>(null);
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [uploadingPartId, setUploadingPartId] = useState<string | null>(null);
  const [wholePartProductId, setWholePartProductId] = useState<string | null>(null);
  const [productionCompleteProductId, setProductionCompleteProductId] = useState<string | null>(null);
  const [createdWholePartProductIds, setCreatedWholePartProductIds] = useState<string[]>([]);
  const [partForm, setPartForm] = useState<PartForm>(emptyPartForm());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const partTotalQuantity = useMemo(() => calculatedTotalQuantity(partForm), [partForm]);
  const canCreateDelivery = useMemo(
    () => order.products.some((product) => product.status === "WAIT_DELIVERY" || product.status === "PARTIAL_DELIVERED"),
    [order.products]
  );
  const productionProgressHref = `/production?keyword=${encodeURIComponent(order.orderNo)}`;

  function renderProductionProgress() {
    return (
      <section className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={cardTitle}>生产进度</h2>
            <p className={pageDescription}>查看该订单下产品和部件的下料、焊接、抛光、外发、回厂、送货进度。</p>
          </div>
          <Link
            className={`${buttonPrimary} !text-white`}
            href={productionProgressHref}
          >
            进入生产进度
          </Link>
        </div>

        {order.products.length === 0 ? (
          <div className="mt-4 rounded-md bg-[#fbfcfd] px-3 py-6 text-center text-sm text-[#667085]">暂无生产进度，请先添加产品和部件。</div>
        ) : (
          <div className="mt-5 space-y-4">
            {order.products.map((product) => {
              const partCount = product.parts.length;
              const drawingCount = product.parts.reduce((sum, part) => sum + part.drawings.length, 0);
              const outsourcedTotal = product.parts.reduce((sum, part) => sum + part.outsourcedQuantity, 0);
              const returnedTotal = product.parts.reduce((sum, part) => sum + part.returnedQuantity, 0);
              const missingTotal = product.parts.reduce((sum, part) => sum + part.missingQuantity, 0);

              return (
                <div key={product.id} className="overflow-hidden rounded-lg border border-[#d8dde6] bg-white">
                  <div className="bg-[#f6f7f9] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[#172033]">{product.productName}</div>
                        <div className="mt-1 text-xs text-[#667085]">
                          规格：{formatEmpty(product.specification)} · 材质：{formatEmpty(product.material)} · 数量：{product.quantity}
                        </div>
                      </div>
                      <span className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                        {getProductStatusLabel(product.status)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-[#475467] sm:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-md bg-white px-3 py-2">部件数量：<span className="font-semibold text-[#172033]">{partCount}</span></div>
                      <div className="rounded-md bg-white px-3 py-2">图纸数量：<span className="font-semibold text-[#172033]">{drawingCount}</span></div>
                      <div className="rounded-md bg-white px-3 py-2">外发总数：<span className="font-semibold text-[#172033]">{outsourcedTotal}</span></div>
                      <div className="rounded-md bg-white px-3 py-2">回厂总数：<span className="font-semibold text-[#172033]">{returnedTotal}</span></div>
                      <div className="rounded-md bg-white px-3 py-2">未回总数：<span className="font-semibold text-[#172033]">{missingTotal}</span></div>
                      <div className="rounded-md bg-white px-3 py-2">表面处理：<span className="font-semibold text-[#172033]">{formatEmpty(product.surfaceTreatment)}</span></div>
                    </div>
                  </div>

                  <div className={`${tableWrapper} rounded-none border-0 border-t border-[#d8dde6]`}>
                    <table className={`${table} min-w-[1320px] text-xs`}>
                      <thead className={tableHead}>
                        <tr>
                          <th className={tableHeaderCell}>部件编号</th>
                          <th className={tableHeaderCell}>部件名称</th>
                          <th className={tableHeaderCell}>总数量</th>
                          <th className={tableHeaderCell}>图纸</th>
                          <th className={tableHeaderCell}>已外发</th>
                          <th className={tableHeaderCell}>已回</th>
                          <th className={tableHeaderCell}>未回</th>
                          <th className={tableHeaderCell}>当前阶段</th>
                          {progressFlowColumns.map((column) => (
                            <th key={column.key} className={tableHeaderCell}>
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {product.parts.map((part) => {
                          const flow = getPartProductionFlow(part.status, product.status);
                          return (
                            <tr key={part.id} className={`${tableRow} bg-white`}>
                              <td className={tableCell}>{formatEmpty(part.partCode)}</td>
                              <td className={`${tableCell} font-medium text-[#172033]`}>{part.partName}</td>
                              <td className={tableCell}>{part.totalQuantity}</td>
                              <td className={tableCell}>{part.drawings.length}</td>
                              <td className={tableCell}>{part.outsourcedQuantity}</td>
                              <td className={tableCell}>{part.returnedQuantity}</td>
                              <td className={tableCell}>{part.missingQuantity}</td>
                              <td className={`${tableCell} font-semibold`}>{getProductPartStatusLabel(part.status)}</td>
                              {progressFlowColumns.map((column) => (
                                <td key={column.key} className={tableCell}>
                                  <ProgressBadge value={flow[column.key]} />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                        {product.parts.length === 0 ? (
                          <tr>
                            <td className="px-3 py-5 text-center text-[#667085]" colSpan={14}>该产品暂无部件。</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  function updateOrderField(field: keyof OrderForm, value: string) {
    setOrderForm((current) => ({ ...current, [field]: value }));
  }

  function updateProductField(field: keyof ProductForm, value: string) {
    setProductForm((current) => ({ ...current, [field]: value }));
  }

  function updatePartField(field: keyof PartForm, value: string) {
    setPartForm((current) => ({ ...current, [field]: value }));
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
    const data = await response.json().catch(() => ({ error: "服务器返回了非 JSON 错误，请检查服务端日志。" }));

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
    const data = await response.json().catch(() => ({ error: "服务器返回了非 JSON 错误，请检查服务端日志。" }));

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
    const data = await response.json().catch(() => ({ error: "服务器返回了非 JSON 错误，请检查服务端日志。" }));

    if (!response.ok) {
      setError(data.error ?? "删除产品失败。");
      return;
    }

    refreshWithMessage("产品已删除。");
  }

  async function createWholeProductPart(product: Product) {
    if (product.parts.length > 0 || createdWholePartProductIds.includes(product.id)) {
      window.alert("该产品已有部件，不能设为整件产品");
      return;
    }

    if (!window.confirm("确认将该产品设为整件产品吗？系统会自动创建一个“整件”部件。")) {
      return;
    }

    setMessage("");
    setError("");
    setWholePartProductId(product.id);

    try {
      const response = await fetch(`/api/products/${product.id}/whole-part`, { method: "POST" });
      const text = await response.text();
      let data: { error?: string; success?: boolean } = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        window.alert(data.error ?? "设为整件产品失败");
        return;
      }

      window.alert("已设为整件产品");
      setCreatedWholePartProductIds((current) => current.includes(product.id) ? current : [...current, product.id]);
      refreshWithMessage("已设为整件产品。");
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : "设为整件产品失败");
    } finally {
      setWholePartProductId(null);
    }
  }

  async function markProductionComplete(product: Product) {
    if (!window.confirm("\u786e\u8ba4\u5c06\u8be5\u4ea7\u54c1\u6807\u8bb0\u4e3a\u751f\u4ea7\u5b8c\u6210\u5e76\u8fdb\u5165\u5f85\u9001\u8d27\u5417\uff1f")) {
      return;
    }

    setMessage("");
    setError("");
    setProductionCompleteProductId(product.id);

    try {
      const response = await fetch(`/api/products/${product.id}/mark-production-complete`, { method: "POST" });
      const text = await response.text();
      let data: { error?: string; success?: boolean } = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const nextError = data.error ?? "\u6807\u8bb0\u751f\u4ea7\u5b8c\u6210\u5931\u8d25";
        window.alert(nextError);
        setError(nextError);
        return;
      }

      window.alert("\u5df2\u6807\u8bb0\u751f\u4ea7\u5b8c\u6210");
      refreshWithMessage("\u5df2\u6807\u8bb0\u751f\u4ea7\u5b8c\u6210\u3002");
    } catch (requestError) {
      const nextError = requestError instanceof Error ? requestError.message : "\u6807\u8bb0\u751f\u4ea7\u5b8c\u6210\u5931\u8d25";
      window.alert(nextError);
      setError(nextError);
    } finally {
      setProductionCompleteProductId(null);
    }
  }

  function startAddPart(product: Product) {
    setActivePartProductId(product.id);
    setEditingPartId(null);
    setPartForm(emptyPartForm(product.quantity));
    setMessage("");
    setError("");
  }

  function startEditPart(product: Product, part: ProductPart) {
    setActivePartProductId(product.id);
    setEditingPartId(part.id);
    setPartForm({
      partName: part.partName,
      partCode: part.partCode ?? "",
      specification: part.specification ?? "",
      material: part.material ?? "",
      unitQuantity: String(part.unitQuantity),
      productQuantity: String(part.productQuantity),
      surfaceTreatment: part.surfaceTreatment ?? "",
      color: part.color ?? "",
      remark: part.remark ?? ""
    });
    setMessage("");
    setError("");
  }

  function resetPartForm() {
    setActivePartProductId(null);
    setEditingPartId(null);
    setPartForm(emptyPartForm());
  }

  async function savePart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!activePartProductId) {
      setError("请先选择产品。");
      return;
    }
    if (!partForm.partName.trim()) {
      setError("部件名称不能为空。");
      return;
    }
    if (Number(partForm.unitQuantity) <= 0) {
      setError("单套用量必须大于 0。");
      return;
    }
    if (Number(partForm.productQuantity) <= 0) {
      setError("产品数量必须大于 0。");
      return;
    }
    if (partTotalQuantity < 0) {
      setError("应加工数量不能为负数。");
      return;
    }

    const response = await fetch(editingPartId ? `/api/parts/${editingPartId}` : `/api/products/${activePartProductId}/parts`, {
      method: editingPartId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partForm)
    });
    const data = await response.json().catch(() => ({ error: "服务器返回了非 JSON 错误，请检查服务端日志。" }));

    if (!response.ok) {
      setError(data.error ?? "保存部件失败。");
      return;
    }

    resetPartForm();
    refreshWithMessage(editingPartId ? "部件已保存。" : "部件已新增。");
  }

  async function deletePart(part: ProductPart) {
    if (!window.confirm(`\u786e\u8ba4\u5220\u9664\u90e8\u4ef6\u201c${part.partName}\u201d\u5417\uff1f`)) {
      return;
    }

    setMessage("");
    setError("");
    const response = await fetch(`/api/parts/${part.id}`, { method: "DELETE" });
    const text = await response.text();
    let data: { error?: string; success?: boolean } = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      const nextError = data.error ?? "\u5220\u9664\u90e8\u4ef6\u5931\u8d25";
      window.alert(nextError);
      setError(nextError);
      return;
    }

    if (editingPartId === part.id) {
      resetPartForm();
    }
    window.alert("\u5220\u9664\u6210\u529f");
    refreshWithMessage("\u90e8\u4ef6\u5df2\u5220\u9664\u3002");
  }
  async function uploadDrawings(event: React.FormEvent<HTMLFormElement>, part: ProductPart) {
    event.preventDefault();
    setMessage("");
    setError("");
    setUploadingPartId(part.id);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch(`/api/parts/${part.id}/drawings`, {
      method: "POST",
      body: formData
    });
    const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查服务端日志。" }));

    setUploadingPartId(null);

    if (!response.ok) {
      setError(data.error ?? "上传图纸失败。");
      return;
    }

    form.reset();
    refreshWithMessage("图纸已上传。");
  }

  async function updateDrawingStatus(drawing: PartDrawing, status: string) {
    setMessage("");
    setError("");

    const response = await fetch(`/api/drawings/${drawing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查服务端日志。" }));

    if (!response.ok) {
      setError(data.error ?? "更新图纸状态失败。");
      return;
    }

    refreshWithMessage("图纸状态已更新。");
  }

  async function setMainDrawing(drawing: PartDrawing) {
    setMessage("");
    setError("");

    const response = await fetch(`/api/drawings/${drawing.id}/main`, { method: "POST" });
    const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查服务端日志。" }));

    if (!response.ok) {
      setError(data.error ?? "设置主图失败。");
      return;
    }

    refreshWithMessage("主图已设置。");
  }

  async function obsoleteDrawing(drawing: PartDrawing) {
    if (!window.confirm(`确认作废图纸“${drawing.fileName}”吗？文件不会从磁盘删除。`)) {
      return;
    }

    setMessage("");
    setError("");
    const response = await fetch(`/api/drawings/${drawing.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({ error: "服务端返回了非 JSON 错误，请检查服务端日志。" }));

    if (!response.ok) {
      setError(data.error ?? "作废图纸失败。");
      return;
    }

    refreshWithMessage("图纸已作废。");
  }

  function renderDrawingPreview(drawing: PartDrawing) {
    if (drawing.thumbnailUrl) {
      return <img className="h-16 w-20 rounded border border-[#d8dde6] object-contain" src={drawing.thumbnailUrl} alt={drawing.fileName} />;
    }

    return (
      <div className="flex h-16 w-20 items-center justify-center rounded border border-[#d8dde6] bg-[#eef2f6] text-xs font-semibold text-[#475467]">
        PDF
      </div>
    );
  }

  function renderDrawingManager(part: ProductPart) {
    return (
      <div className="space-y-4 rounded-md border border-[#d8dde6] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold">图纸管理</h4>
            <p className="mt-1 text-xs text-[#667085]">支持 JPG、JPEG、PNG、WEBP、PDF；DWG/DXF 请先导出后上传。</p>
          </div>
          <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => uploadDrawings(event, part)}>
            <input
              className="max-w-72 rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm"
              type="file"
              name="files"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
            />
            <button className="rounded-md bg-[#172033] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60" disabled={uploadingPartId === part.id}>
              {uploadingPartId === part.id ? "上传中" : "上传图纸"}
            </button>
          </form>
        </div>

        {part.drawings.length === 0 ? (
          <div className="rounded-md bg-[#fbfcfd] px-3 py-4 text-center text-sm text-[#667085]">暂无图纸</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead className="bg-[#eef2f6] text-[#475467]">
                <tr>
                  <th className="border-b border-[#d8dde6] px-3 py-2">缩略图</th>
                  <th className="border-b border-[#d8dde6] px-3 py-2">文件名</th>
                  <th className="border-b border-[#d8dde6] px-3 py-2">版本</th>
                  <th className="border-b border-[#d8dde6] px-3 py-2">主图</th>
                  <th className="border-b border-[#d8dde6] px-3 py-2">状态</th>
                  <th className="border-b border-[#d8dde6] px-3 py-2">上传状态</th>
                  <th className="border-b border-[#d8dde6] px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {part.drawings.map((drawing) => (
                  <tr key={drawing.id} className="align-top">
                    <td className="border-b border-[#eef2f6] px-3 py-2">
                      <a href={drawing.originalUrl} target="_blank" rel="noreferrer">
                        {renderDrawingPreview(drawing)}
                      </a>
                    </td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">
                      <div className="font-medium">{drawing.fileName}</div>
                      {drawing.errorMessage ? <div className="mt-1 text-xs text-red-700">{drawing.errorMessage}</div> : null}
                    </td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">V{drawing.version}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{drawing.isMain ? "是" : "否"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">
                      <select className="rounded-md border border-[#cfd6e1] px-2 py-1" value={drawing.status} onChange={(event) => updateDrawingStatus(drawing, event.target.value)}>
                        {drawingStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">{drawing.uploadStatus}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <a className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={drawing.originalUrl} target="_blank" rel="noreferrer">查看原图</a>
                        <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm disabled:opacity-50" disabled={drawing.isMain || drawing.status === "OBSOLETE"} onClick={() => setMainDrawing(drawing)}>
                          设为主图
                        </button>
                        <button className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50" disabled={drawing.status === "OBSOLETE"} onClick={() => obsoleteDrawing(drawing)}>
                          作废
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderPartForm(product: Product) {
    if (activePartProductId !== product.id) {
      return null;
    }

    return (
      <form className="mt-4 grid gap-4 rounded-md border border-[#d8dde6] bg-[#fbfcfd] p-4 lg:grid-cols-5" onSubmit={savePart}>
        <label className="block text-sm font-medium">
          部件名称 <span className="text-red-600">*</span>
          <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={partForm.partName} onChange={(event) => updatePartField("partName", event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          部件编号
          <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={partForm.partCode} onChange={(event) => updatePartField("partCode", event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          规格
          <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={partForm.specification} onChange={(event) => updatePartField("specification", event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          材质
          <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={partForm.material} onChange={(event) => updatePartField("material", event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          单套用量 <span className="text-red-600">*</span>
          <input type="number" min="1" step="1" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={partForm.unitQuantity} onChange={(event) => updatePartField("unitQuantity", event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          产品数量 <span className="text-red-600">*</span>
          <input type="number" min="1" step="1" className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={partForm.productQuantity} onChange={(event) => updatePartField("productQuantity", event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          应加工数量
          <input readOnly className="mt-1 w-full rounded-md border border-[#cfd6e1] bg-[#eef2f6] px-3 py-2" value={partTotalQuantity} />
        </label>
        <label className="block text-sm font-medium">
          表面处理
          <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={partForm.surfaceTreatment} onChange={(event) => updatePartField("surfaceTreatment", event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          颜色要求
          <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={partForm.color} onChange={(event) => updatePartField("color", event.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          备注
          <input className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" value={partForm.remark} onChange={(event) => updatePartField("remark", event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-3 lg:col-span-5">
          <button className="rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isPending}>
            {editingPartId ? "保存部件" : "新增部件"}
          </button>
          <button type="button" className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium" onClick={resetPartForm}>
            取消
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">订单详情：{order.orderNo}</h1>
        <p className="mt-2 text-sm text-[#667085]">查看订单、客户、产品和部件明细。</p>
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

      {renderProductionProgress()}

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">产品明细表</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center justify-center rounded-lg border border-[#cfd6e1] px-4 py-2 text-sm font-semibold hover:bg-[#eef2f6]"
              href={`/orders/${order.id}/import-products`}
            >
              导入产品部件
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#115e59]"
              href={`/orders/${order.id}/drawings/upload-center`}
            >
              图纸上传中心
            </Link>
            {canCreateDelivery ? (
              <Link
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold !text-white hover:bg-slate-700 hover:!text-white"
                href={`/delivery/new?orderId=${order.id}`}
                style={{ color: "#ffffff" }}
              >
                创建送货单
              </Link>
            ) : null}
          </div>
        </div>
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
                <Fragment key={product.id}>
                  <tr className="align-top">
                    <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{product.productName}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{product.specification || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{product.material || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{product.quantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{product.surfaceTreatment || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{product.status}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{product.remark || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" onClick={() => startEditProduct(product)}>编辑</button>
                        <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" onClick={() => startAddPart(product)}>新增部件</button>
                        <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm disabled:opacity-60" disabled={wholePartProductId === product.id} onClick={() => createWholeProductPart(product)}>
                          {wholePartProductId === product.id ? "处理中" : "设为整件产品"}
                        </button>
                        <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm disabled:opacity-60" disabled={productionCompleteProductId === product.id} onClick={() => markProductionComplete(product)}>
                          {productionCompleteProductId === product.id ? "\u5904\u7406\u4e2d" : "\u6807\u8bb0\u751f\u4ea7\u5b8c\u6210"}
                        </button>
                        <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={`/kitting?productId=${product.id}`}>齐套检查</Link>
                        <button className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => deleteProduct(product)}>删除</button>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-[#d8dde6] bg-[#fbfcfd] px-3 py-4" colSpan={8}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold">部件明细</h3>
                        <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" onClick={() => startAddPart(product)}>新增部件</button>
                      </div>
                      {renderPartForm(product)}
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
                          <thead className="bg-[#eef2f6] text-[#475467]">
                            <tr>
                              <th className="border-b border-[#d8dde6] px-3 py-2">部件名称</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">部件编号</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">规格</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">材质</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">单套用量</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">产品数量</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">应加工数量</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">表面处理</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">颜色</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">已外发数量</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">已回数量</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">未回数量</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">状态</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">备注</th>
                              <th className="border-b border-[#d8dde6] px-3 py-2">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {product.parts.map((part) => (
                              <Fragment key={part.id}>
                              <tr className="align-top">
                                <td className="border-b border-[#eef2f6] px-3 py-2 font-medium">{part.partName}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.partCode || "-"}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.specification || "-"}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.material || "-"}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.unitQuantity}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.productQuantity}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.totalQuantity}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.surfaceTreatment || "-"}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.color || "-"}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.outsourcedQuantity}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.returnedQuantity}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.missingQuantity}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.status}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">{part.remark || "-"}</td>
                                <td className="border-b border-[#eef2f6] px-3 py-2">
                                  <div className="flex gap-2">
                                    <button className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" onClick={() => startEditPart(product, part)}>编辑</button>
                                    <button className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => deletePart(part)}>删除</button>
                                  </div>
                                </td>
                              </tr>
                              <tr>
                                <td className="border-b border-[#d8dde6] bg-[#fbfcfd] px-3 py-3" colSpan={15}>
                                  {renderDrawingManager(part)}
                                </td>
                              </tr>
                              </Fragment>
                            ))}
                            {product.parts.length === 0 ? (
                              <tr>
                                <td className="px-3 py-5 text-center text-[#667085]" colSpan={15}>暂无部件，请新增部件。</td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                </Fragment>
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
