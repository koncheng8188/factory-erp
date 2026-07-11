import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDisplayDate } from "@/lib/delivery";
import { PrintActions } from "./print-actions";

export const dynamic = "force-dynamic";

type DeliveryPrintPageProps = {
  params: Promise<{ id: string }>;
};

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

export default async function DeliveryPrintPage({ params }: DeliveryPrintPageProps) {
  const { id } = await params;
  const deliveryOrder = await prisma.deliveryOrder.findFirst({
    where: {
      OR: [{ id }, { deliveryNo: id }]
    },
    include: {
      customer: true,
      order: {
        select: {
          orderNo: true
        }
      },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          order: {
            select: {
              orderNo: true
            }
          },
          product: {
            select: {
              material: true,
              surfaceTreatment: true
            }
          }
        }
      }
    }
  });

  if (!deliveryOrder) {
    notFound();
  }

  return (
    <div>
      <PrintActions deliveryOrderId={deliveryOrder.id} />

      <article className="print-page bg-white text-[#111827]">
        <h1 className="text-center text-2xl font-bold tracking-wide">东莞市杰艺五金家具有限公司送货单</h1>

        <section className="mt-6 grid grid-cols-3 border border-[#222] text-sm">
          <InfoItem label="送货单号" value={deliveryOrder.deliveryNo} />
          <InfoItem label="送货日期" value={formatDisplayDate(deliveryOrder.deliveryDate)} />
          <InfoItem label="客户名称" value={deliveryOrder.customerName} />
          <InfoItem label="联系人" value={deliveryOrder.customer.contact} />
          <InfoItem label="电话" value={deliveryOrder.customer.phone} />
          <InfoItem label="地址" value={deliveryOrder.customer.address} />
          <InfoItem label="收货人" value={deliveryOrder.receiver} />
          <InfoItem label="经手人" value={deliveryOrder.handler} />
          <InfoItem label="备注" value={deliveryOrder.remark} />
        </section>

        <section className="mt-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <PrintTh>序号</PrintTh>
                <PrintTh>订单号</PrintTh>
                <PrintTh>产品名称</PrintTh>
                <PrintTh>规格</PrintTh>
                <PrintTh>材质</PrintTh>
                <PrintTh>表面处理</PrintTh>
                <PrintTh>送货数量</PrintTh>
                <PrintTh>备注</PrintTh>
              </tr>
            </thead>
            <tbody>
              {deliveryOrder.items.map((item, index) => (
                <tr key={item.id}>
                  <PrintTd className="text-center">{index + 1}</PrintTd>
                  <PrintTd>{displayValue(item.order.orderNo)}</PrintTd>
                  <PrintTd>{displayValue(item.productName)}</PrintTd>
                  <PrintTd>{displayValue(item.specification)}</PrintTd>
                  <PrintTd>{displayValue(item.product.material)}</PrintTd>
                  <PrintTd>{displayValue(item.product.surfaceTreatment)}</PrintTd>
                  <PrintTd className="text-center">{item.deliveryQuantity}</PrintTd>
                  <PrintTd>{displayValue(item.remark)}</PrintTd>
                </tr>
              ))}
              {deliveryOrder.items.length === 0 ? (
                <tr>
                  <PrintTd className="text-center" colSpan={8}>暂无送货明细</PrintTd>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="mt-12 grid grid-cols-3 gap-10 text-sm">
          <SignatureItem label="送货方" />
          <SignatureItem label="收货方" />
          <SignatureItem label="签收日期" />
        </section>
      </article>

      <style>{`
        .print-page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 12mm;
          box-shadow: 0 0 0 1px #e5e7eb;
        }

        @page {
          size: A4;
          margin: 12mm;
        }

        @media print {
          .no-print {
            display: none !important;
          }

          aside,
          header {
            display: none !important;
          }

          body {
            background: white !important;
          }

          main {
            margin: 0 !important;
            padding: 0 !important;
          }

          .md\\:pl-64 {
            padding-left: 0 !important;
          }

          .print-page {
            width: auto;
            min-height: auto;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex min-h-10 border-b border-r border-[#222]">
      <div className="flex w-24 shrink-0 items-center justify-center border-r border-[#222] bg-[#f3f4f6] px-2 font-semibold">
        {label}
      </div>
      <div className="flex flex-1 items-center px-2">{displayValue(value)}</div>
    </div>
  );
}

function PrintTh({ children }: { children: React.ReactNode }) {
  return <th className="border border-[#222] bg-[#f3f4f6] px-2 py-2 text-center font-semibold">{children}</th>;
}

function PrintTd({
  children,
  className = "",
  colSpan
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return <td className={`border border-[#222] px-2 py-2 ${className}`} colSpan={colSpan}>{children}</td>;
}

function SignatureItem({ label }: { label: string }) {
  return (
    <div>
      <div className="font-semibold">{label}：</div>
      <div className="mt-8 border-b border-[#222]" />
    </div>
  );
}
