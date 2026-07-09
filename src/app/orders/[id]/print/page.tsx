import type { PartDrawing } from "@prisma/client";
import { notFound } from "next/navigation";
import { getOrderStatusLabel } from "@/lib/order-status";
import { getProductPartStatusLabel } from "@/lib/product-part-status";
import { getProductStatusLabel } from "@/lib/product-status";
import { prisma } from "@/lib/prisma";
import { PrintActions } from "./print-actions";

export const dynamic = "force-dynamic";

type OrderPrintPageProps = {
  params: Promise<{ id: string }>;
};

type DrawingSnapshot = Pick<PartDrawing, "originalUrl" | "thumbnailUrl" | "printThumbnailUrl" | "isMain" | "status">;

function formatDate(value: Date | null | undefined) {
  if (!value) return "-";
  return value.toISOString().slice(0, 10);
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

function pickTaskDrawing(drawings: DrawingSnapshot[]) {
  const confirmedMain = drawings.find((drawing) => drawing.status === "CONFIRMED" && drawing.isMain);
  if (confirmedMain) return confirmedMain;

  const main = drawings.find((drawing) => drawing.isMain);
  if (main) return main;

  return drawings.find((drawing) => drawing.status !== "OBSOLETE") ?? null;
}

function DrawingPreview({ drawings }: { drawings: DrawingSnapshot[] }) {
  const drawing = pickTaskDrawing(drawings);
  const imageUrl = drawing?.printThumbnailUrl ?? drawing?.thumbnailUrl ?? drawing?.originalUrl ?? null;

  if (!imageUrl) {
    return <div className="drawing-empty">无图纸</div>;
  }

  return <img className="drawing-thumb" src={imageUrl} alt="图纸缩略图" />;
}

function productColors(parts: Array<{ color: string | null }>) {
  const colors = Array.from(new Set(parts.map((part) => part.color).filter((color): color is string => Boolean(color))));
  return colors.length > 0 ? colors.join("、") : "-";
}

export default async function OrderPrintPage({ params }: OrderPrintPageProps) {
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id }, { orderNo: id }]
    },
    include: {
      customer: true,
      products: {
        orderBy: { createdAt: "asc" },
        include: {
          parts: {
            orderBy: { createdAt: "asc" },
            include: {
              drawings: {
                orderBy: [{ isMain: "desc" }, { version: "desc" }, { createdAt: "desc" }]
              }
            }
          }
        }
      }
    }
  });

  if (!order) {
    notFound();
  }

  const parts = order.products.flatMap((product) =>
    product.parts.map((part) => ({
      ...part,
      productName: product.productName
    }))
  );
  const printTime = new Date().toLocaleString("zh-CN", { hour12: false });

  return (
    <div>
      <PrintActions orderId={order.id} />

      <article className="task-print-page bg-white text-[#111827]">
        <div className="print-header">
          <h1>金鸿ERP 生产任务单</h1>
          <div>打印时间：{printTime}</div>
        </div>

        <section className="print-section">
          <h2>一、订单信息</h2>
          <div className="info-grid">
            <InfoItem label="订单号" value={order.orderNo} />
            <InfoItem label="订单日期" value={formatDate(order.orderDate)} />
            <InfoItem label="交货日期" value={formatDate(order.deliveryDate)} />
            <InfoItem label="订单状态" value={getOrderStatusLabel(order.status)} />
            <InfoItem className="info-wide" label="订单备注" value={order.remark} />
          </div>
        </section>

        <section className="print-section">
          <h2>二、客户信息</h2>
          <div className="info-grid">
            <InfoItem label="客户名称" value={order.customer.name || order.customerName} />
            <InfoItem label="联系人" value={order.customer.contact} />
            <InfoItem label="电话" value={order.customer.phone} />
            <InfoItem className="info-wide" label="地址" value={order.customer.address} />
          </div>
        </section>

        <section className="print-section">
          <h2>三、产品清单</h2>
          <table className="task-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>产品名称</th>
                <th>规格</th>
                <th>材质</th>
                <th>表面处理</th>
                <th>颜色</th>
                <th>数量</th>
                <th>状态</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {order.products.map((product, index) => (
                <tr key={product.id}>
                  <td className="center">{index + 1}</td>
                  <td>{product.productName}</td>
                  <td>{displayValue(product.specification)}</td>
                  <td>{displayValue(product.material)}</td>
                  <td>{displayValue(product.surfaceTreatment)}</td>
                  <td>{productColors(product.parts)}</td>
                  <td className="center">{product.quantity}</td>
                  <td>{getProductStatusLabel(product.status)}</td>
                  <td>{displayValue(product.remark)}</td>
                </tr>
              ))}
              {order.products.length === 0 ? (
                <tr>
                  <td className="center" colSpan={9}>暂无产品</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h2>四、部件清单</h2>
          <table className="task-table part-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>所属产品</th>
                <th>图纸</th>
                <th>部件编号</th>
                <th>部件名称</th>
                <th>规格</th>
                <th>材质</th>
                <th>表面处理</th>
                <th>颜色</th>
                <th>单件用量</th>
                <th>产品数量</th>
                <th>总数量</th>
                <th>状态</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part, index) => (
                <tr key={part.id}>
                  <td className="center">{index + 1}</td>
                  <td>{part.productName}</td>
                  <td className="center"><DrawingPreview drawings={part.drawings} /></td>
                  <td>{displayValue(part.partCode)}</td>
                  <td>{part.partName}</td>
                  <td>{displayValue(part.specification)}</td>
                  <td>{displayValue(part.material)}</td>
                  <td>{displayValue(part.surfaceTreatment)}</td>
                  <td>{displayValue(part.color)}</td>
                  <td className="center">{part.unitQuantity}</td>
                  <td className="center">{part.productQuantity}</td>
                  <td className="center">{part.totalQuantity}</td>
                  <td>{getProductPartStatusLabel(part.status)}</td>
                  <td>{displayValue(part.remark)}</td>
                </tr>
              ))}
              {parts.length === 0 ? (
                <tr>
                  <td className="center" colSpan={14}>暂无部件</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h2>五、生产确认区</h2>
          <table className="task-table confirm-table">
            <tbody>
              <tr>
                <th>下料签字</th>
                <td />
                <th>焊接签字</th>
                <td />
                <th>抛光签字</th>
                <td />
              </tr>
              <tr>
                <th>外发确认</th>
                <td />
                <th>回厂确认</th>
                <td />
                <th>备注</th>
                <td />
              </tr>
            </tbody>
          </table>
        </section>
      </article>

      <style>{`
        .task-print-page {
          width: 297mm;
          min-height: 210mm;
          margin: 0 auto;
          padding: 10mm;
          box-shadow: 0 0 0 1px #e5e7eb;
        }

        .print-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          color: #000;
        }

        .print-header h1 {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0;
        }

        .print-header div {
          font-size: 11px;
        }

        .print-section {
          margin-top: 12px;
          color: #000;
        }

        .print-section h2 {
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 700;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border-top: 1px solid #000;
          border-left: 1px solid #000;
          font-size: 10px;
        }

        .info-item {
          display: grid;
          grid-template-columns: 72px 1fr;
          min-height: 26px;
          border-right: 1px solid #000;
          border-bottom: 1px solid #000;
        }

        .info-wide {
          grid-column: span 4;
        }

        .info-label {
          display: flex;
          align-items: center;
          justify-content: center;
          border-right: 1px solid #000;
          background: #f3f4f6;
          font-weight: 700;
        }

        .info-value {
          display: flex;
          align-items: center;
          padding: 4px 6px;
        }

        .task-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
          line-height: 1.25;
        }

        .task-table th,
        .task-table td {
          border: 1px solid #000;
          padding: 4px;
          vertical-align: middle;
          color: #000;
        }

        .task-table th {
          background: #f3f4f6;
          font-weight: 700;
          text-align: center;
        }

        .part-table {
          font-size: 9px;
        }

        .center {
          text-align: center;
        }

        .drawing-thumb {
          width: 90px;
          height: 64px;
          object-fit: contain;
        }

        .drawing-empty {
          display: inline-flex;
          width: 90px;
          height: 64px;
          align-items: center;
          justify-content: center;
          color: #000;
        }

        .confirm-table th,
        .confirm-table td {
          height: 34px;
        }

        .confirm-table th {
          width: 12%;
        }

        .confirm-table td {
          width: 21%;
        }

        @page {
          size: A4 landscape;
          margin: 10mm;
        }

        @media print {
          .no-print,
          aside,
          header,
          button {
            display: none !important;
          }

          body {
            background: white !important;
            color: #000 !important;
          }

          main {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .md\\:pl-64 {
            padding-left: 0 !important;
          }

          .task-print-page {
            width: auto;
            min-height: auto;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }

          .task-table tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

function InfoItem({
  label,
  value,
  className = ""
}: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
}) {
  return (
    <div className={`info-item ${className}`}>
      <div className="info-label">{label}</div>
      <div className="info-value">{displayValue(value)}</div>
    </div>
  );
}
