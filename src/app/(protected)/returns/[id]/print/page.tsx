import { notFound } from "next/navigation";
import { requirePageAllPermissions, requirePagePermission } from "@/lib/auth/authorization";
import { formatDisplayDate, outsourceTypeLabels, type OutsourceTypeValue } from "@/lib/outsource";
import { getOutsourceStatusLabel } from "@/lib/outsource-status";
import { prisma } from "@/lib/prisma";
import { withProtectedOutsourceDrawingUrls } from "@/lib/drawing-file-url";
import { PrintActions } from "./print-actions";

export const dynamic = "force-dynamic";

type ReturnPrintPageProps = {
  params: Promise<{ id: string }>;
};

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

function formatReturnNo(id: string, returnDate: Date | null | undefined) {
  const date = returnDate && !Number.isNaN(returnDate.getTime()) ? returnDate : null;
  const dateText = date ? date.toISOString().slice(0, 10).replaceAll("-", "") : "";
  const shortCode = id.slice(-5).toUpperCase();

  return dateText ? `HC${dateText}-${shortCode}` : `HC-${shortCode}`;
}

function typeLabel(type: string) {
  return outsourceTypeLabels[type as OutsourceTypeValue] ?? type;
}

function itemStatusLabel(status: string) {
  const labels: Record<string, string> = {
    OUTSOURCED: "待回厂",
    PARTIAL_RETURN: "部分回厂",
    RETURNED: "已回厂",
    ABNORMAL: "异常"
  };

  return labels[status] ?? status;
}

function DrawingPreview({ thumbnailUrl, originalUrl }: { thumbnailUrl: string | null; originalUrl: string | null }) {
  const imageUrl = thumbnailUrl ?? originalUrl;

  if (!imageUrl) {
    return <div className="drawing-empty">无图纸</div>;
  }

  return <img className="drawing-thumb" src={imageUrl} alt="回厂图纸缩略图" />;
}

export default async function ReturnPrintPage({ params }: ReturnPrintPageProps) {
  await requirePagePermission("return.view");
  await requirePageAllPermissions(["return.print", "drawing.view"]);

  const { id } = await params;
  const returnOrder = await prisma.outsourceReturn.findUnique({
    where: { id },
    include: {
      outsourceOrder: true,
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          outsourceOrderItem: {
            include: {
              order: {
                select: {
                  orderNo: true
                }
              },
              part: {
                select: {
                  partCode: true,
                  specification: true,
                  material: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!returnOrder) {
    notFound();
  }

  const printTime = new Date().toLocaleString("zh-CN", { hour12: false });

  return (
    <div>
      <PrintActions id={returnOrder.id} />

      <article className="return-print-page bg-white text-[#111827]">
        <div className="print-title">
          <h1>金鸿ERP 回厂验收单</h1>
          <div>打印时间：{printTime}</div>
        </div>

        <section className="print-section">
          <h2>一、回厂记录信息</h2>
          <div className="info-grid">
            <InfoItem className="info-wide" label="回厂单号" value={formatReturnNo(returnOrder.id, returnOrder.returnDate)} />
            <InfoItem label="回厂日期" value={formatDisplayDate(returnOrder.returnDate)} />
            <InfoItem label="关联外发单号" value={returnOrder.outsourceOrder.outsourceNo} />
            <InfoItem label="供应商" value={returnOrder.outsourceOrder.supplierName} />
            <InfoItem label="外发类型" value={typeLabel(returnOrder.outsourceOrder.outsourceType)} />
            <InfoItem label="外发单状态" value={getOutsourceStatusLabel(returnOrder.outsourceOrder.status)} />
            <InfoItem label="经手人" value={returnOrder.handler} />
            <InfoItem className="info-wide" label="备注" value={returnOrder.remark} />
          </div>
        </section>

        <section className="print-section">
          <h2>二、回厂明细表</h2>
          <table className="print-table detail-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>图纸</th>
                <th>订单号</th>
                <th>产品名称</th>
                <th>部件编号</th>
                <th>部件名称</th>
                <th>规格</th>
                <th>材质</th>
                <th>表面处理</th>
                <th>颜色</th>
                <th>外发数量</th>
                <th>本次回厂数量</th>
                <th>异常数量</th>
                <th>异常原因</th>
                <th>已回数量</th>
                <th>未回数量</th>
                <th>状态</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {returnOrder.items.map((item, index) => {
                const outsourceItem = item.outsourceOrderItem;

                return (
                  <tr key={item.id}>
                    <td className="center">{index + 1}</td>
                    <td className="center"><DrawingPreview thumbnailUrl={withProtectedOutsourceDrawingUrls(outsourceItem).thumbnailUrl} originalUrl={withProtectedOutsourceDrawingUrls(outsourceItem).originalUrl} /></td>
                    <td>{outsourceItem.order.orderNo}</td>
                    <td>{outsourceItem.productName}</td>
                    <td>{displayValue(outsourceItem.part.partCode)}</td>
                    <td>{outsourceItem.partName}</td>
                    <td>{displayValue(outsourceItem.part.specification)}</td>
                    <td>{displayValue(outsourceItem.part.material)}</td>
                    <td>{displayValue(outsourceItem.surfaceTreatment)}</td>
                    <td>{displayValue(outsourceItem.color)}</td>
                    <td className="center">{outsourceItem.outsourceQuantity}</td>
                    <td className="center">{item.returnQuantity}</td>
                    <td className="center">{item.abnormalQuantity}</td>
                    <td>{displayValue(item.abnormalReason)}</td>
                    <td className="center">{outsourceItem.returnedQuantity}</td>
                    <td className="center">{outsourceItem.missingQuantity}</td>
                    <td>{itemStatusLabel(outsourceItem.status)}</td>
                    <td>{displayValue(item.remark)}</td>
                  </tr>
                );
              })}
              {returnOrder.items.length === 0 ? (
                <tr>
                  <td className="center" colSpan={18}>暂无回厂明细</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h2>三、签字确认区</h2>
          <table className="print-table confirm-table">
            <tbody>
              <tr>
                <th>外发经手人</th>
                <td />
                <th>回厂验收人</th>
                <td />
                <th>供应商确认</th>
                <td />
              </tr>
              <tr>
                <th>日期</th>
                <td />
                <th>备注</th>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </section>
      </article>

      <style>{`
        .return-print-page {
          width: 297mm;
          min-height: 210mm;
          margin: 0 auto;
          padding: 10mm;
          box-shadow: 0 0 0 1px #e5e7eb;
        }

        .print-title {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          color: #000;
        }

        .print-title h1 {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0;
        }

        .print-title div {
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
          grid-template-columns: 82px 1fr;
          min-height: 26px;
          border-right: 1px solid #000;
          border-bottom: 1px solid #000;
        }

        .info-wide {
          grid-column: span 2;
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

        .print-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9px;
          line-height: 1.25;
        }

        .print-table th,
        .print-table td {
          border: 1px solid #000;
          padding: 4px;
          vertical-align: middle;
          color: #000;
        }

        .print-table th {
          background: #f3f4f6;
          font-weight: 700;
          text-align: center;
        }

        .center {
          text-align: center;
        }

        .drawing-thumb {
          width: 80px;
          height: 60px;
          object-fit: contain;
        }

        .drawing-empty {
          display: inline-flex;
          width: 80px;
          height: 60px;
          align-items: center;
          justify-content: center;
          color: #000;
        }

        .confirm-table {
          font-size: 10px;
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

          .return-print-page {
            width: auto;
            min-height: auto;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }

          .print-table tr {
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
