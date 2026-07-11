import { notFound } from "next/navigation";
import { formatDisplayDate, outsourceTypeLabels, type OutsourceTypeValue } from "@/lib/outsource";
import { getOutsourceStatusLabel } from "@/lib/outsource-status";
import { prisma } from "@/lib/prisma";
import { PrintActions } from "./print-actions";

export const dynamic = "force-dynamic";

type OutsourcePrintPageProps = {
  params: Promise<{ id: string }>;
};

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
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

  return <img className="drawing-thumb" src={imageUrl} alt="外发图纸缩略图" />;
}

export default async function OutsourcePrintPage({ params }: OutsourcePrintPageProps) {
  const { id } = await params;
  const outsourceOrder = await prisma.outsourceOrder.findFirst({
    where: {
      OR: [{ id }, { outsourceNo: id }]
    },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
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
  });

  if (!outsourceOrder) {
    notFound();
  }

  const orderNos = Array.from(new Set(outsourceOrder.items.map((item) => item.order.orderNo)));
  const printTime = new Date().toLocaleString("zh-CN", { hour12: false });

  return (
    <div>
      <PrintActions id={outsourceOrder.id} />

      <article className="outsource-print-page bg-white text-[#111827]">
        <div className="print-title">
          <h1>金鸿ERP 外发电镀单</h1>
          <div>打印时间：{printTime}</div>
        </div>

        <section className="print-section">
          <h2>一、外发单信息</h2>
          <div className="info-grid">
            <InfoItem label="外发单号" value={outsourceOrder.outsourceNo} />
            <InfoItem label="外发日期" value={formatDisplayDate(outsourceOrder.outsourceDate)} />
            <InfoItem label="外发类型" value={typeLabel(outsourceOrder.outsourceType)} />
            <InfoItem label="供应商" value={outsourceOrder.supplierName} />
            <InfoItem label="状态" value={getOutsourceStatusLabel(outsourceOrder.status)} />
            <InfoItem label="经手人" value={outsourceOrder.handler} />
            <InfoItem className="info-wide" label="备注" value={outsourceOrder.remark} />
          </div>
        </section>

        <section className="print-section">
          <h2>二、订单信息</h2>
          <div className="info-grid">
            <InfoItem className="info-wide" label="订单号" value={orderNos.length === 0 ? "-" : orderNos.join("、")} />
          </div>
        </section>

        <section className="print-section">
          <h2>三、外发明细表</h2>
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
                <th>已回数量</th>
                <th>未回数量</th>
                <th>状态</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {outsourceOrder.items.map((item, index) => (
                <tr key={item.id}>
                  <td className="center">{index + 1}</td>
                  <td className="center"><DrawingPreview thumbnailUrl={item.thumbnailUrl} originalUrl={item.originalUrl} /></td>
                  <td>{item.order.orderNo}</td>
                  <td>{item.productName}</td>
                  <td>{displayValue(item.part.partCode)}</td>
                  <td>{item.partName}</td>
                  <td>{displayValue(item.part.specification)}</td>
                  <td>{displayValue(item.part.material)}</td>
                  <td>{displayValue(item.surfaceTreatment)}</td>
                  <td>{displayValue(item.color)}</td>
                  <td className="center">{item.outsourceQuantity}</td>
                  <td className="center">{item.returnedQuantity}</td>
                  <td className="center">{item.missingQuantity}</td>
                  <td>{itemStatusLabel(item.status)}</td>
                  <td>{displayValue(item.remark)}</td>
                </tr>
              ))}
              {outsourceOrder.items.length === 0 ? (
                <tr>
                  <td className="center" colSpan={15}>暂无外发明细</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h2>四、签字确认区</h2>
          <table className="print-table confirm-table">
            <tbody>
              <tr>
                <th>外发经手人</th>
                <td />
                <th>供应商签收</th>
                <td />
                <th>回厂验收</th>
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
        .outsource-print-page {
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
          grid-template-columns: 76px 1fr;
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

          .outsource-print-page {
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
