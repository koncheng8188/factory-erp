import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { withProtectedOutsourceDrawingUrls } from "@/lib/drawing-file-url";
import { formatDisplayDate, outsourceTypeLabels, type OutsourceTypeValue } from "@/lib/outsource";

export const dynamic = "force-dynamic";

type OutsourceDetailPageProps = {
  params: Promise<{ id: string }>;
};

function typeLabel(type: string) {
  return outsourceTypeLabels[type as OutsourceTypeValue] ?? type;
}

function renderDrawingPreview(item: { thumbnailUrl: string | null; originalUrl: string | null; drawing: { fileType: string | null } | null }) {
  if (item.thumbnailUrl) {
    return <img className="h-16 w-20 rounded border border-[#d8dde6] object-contain" src={item.thumbnailUrl} alt="外发图纸缩略图" />;
  }
  if (item.originalUrl) {
    return (
      <div className="flex h-16 w-20 items-center justify-center rounded border border-[#d8dde6] bg-[#eef2f6] text-xs font-semibold text-[#475467]">
        {item.drawing?.fileType?.toLowerCase() === "pdf" ? "PDF" : "图纸"}
      </div>
    );
  }
  return (
    <div className="flex h-16 w-20 items-center justify-center rounded border border-[#d8dde6] bg-[#f6f7f9] text-xs text-[#667085]">
      无图
    </div>
  );
}

export default async function OutsourceDetailPage({ params }: OutsourceDetailPageProps) {
  const { id } = await params;
  const outsourceOrder = await prisma.outsourceOrder.findFirst({
    where: {
      OR: [{ id }, { outsourceNo: id }]
    },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          order: { select: { orderNo: true } },
          part: {
            select: {
              partCode: true,
              specification: true,
              material: true
            }
          },
          drawing: {
            select: {
              fileType: true
            }
          }
        }
      },
      returns: {
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            select: {
              returnQuantity: true,
              abnormalQuantity: true
            }
          }
        }
      }
    }
  });

  if (!outsourceOrder) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/outsourcing">
          返回外发单列表
        </Link>
      </div>

      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">外发单详情：{outsourceOrder.outsourceNo}</h1>
          <p className="mt-2 text-sm text-[#667085]">查看外发单基本信息、部件外发明细和回厂记录。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/outsourcing/${outsourceOrder.id}/print`}
            className="inline-flex items-center justify-center rounded-lg bg-[#172033] px-4 py-2 text-sm font-semibold text-white !text-white hover:bg-[#344054] hover:text-white hover:!text-white"
            style={{ color: "#ffffff" }}
          >
            打印外发电镀单
          </Link>
          <Link
            href={`/returns/new?outsourceOrderId=${outsourceOrder.id}`}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold !text-white hover:bg-slate-700 hover:!text-white"
            style={{ color: "#ffffff" }}
          >
            登记回厂
          </Link>
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">外发单基本信息</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[#667085]">外发单号</dt><dd className="mt-1 font-medium">{outsourceOrder.outsourceNo}</dd></div>
          <div><dt className="text-[#667085]">外发厂家</dt><dd className="mt-1 font-medium">{outsourceOrder.supplierName}</dd></div>
          <div><dt className="text-[#667085]">外发类型</dt><dd className="mt-1">{typeLabel(outsourceOrder.outsourceType)}</dd></div>
          <div><dt className="text-[#667085]">外发日期</dt><dd className="mt-1">{formatDisplayDate(outsourceOrder.outsourceDate)}</dd></div>
          <div><dt className="text-[#667085]">预计回厂日期</dt><dd className="mt-1">{formatDisplayDate(outsourceOrder.expectedReturnDate)}</dd></div>
          <div><dt className="text-[#667085]">实际回厂日期</dt><dd className="mt-1">{formatDisplayDate(outsourceOrder.actualReturnDate)}</dd></div>
          <div><dt className="text-[#667085]">状态</dt><dd className="mt-1">{outsourceOrder.status}</dd></div>
          <div><dt className="text-[#667085]">经手人</dt><dd className="mt-1">{outsourceOrder.handler || "-"}</dd></div>
          <div className="sm:col-span-2 lg:col-span-4"><dt className="text-[#667085]">备注</dt><dd className="mt-1">{outsourceOrder.remark || "-"}</dd></div>
        </dl>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">外发明细</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">图纸</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">查看原图</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件编号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">规格</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">材质</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">表面处理</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">颜色</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">外发数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">已回数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">未回数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">明细状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
              </tr>
            </thead>
            <tbody>
              {outsourceOrder.items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3">{renderDrawingPreview(withProtectedOutsourceDrawingUrls(item))}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    {withProtectedOutsourceDrawingUrls(item).originalUrl ? (
                      <a className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={withProtectedOutsourceDrawingUrls(item).originalUrl ?? ""} target="_blank" rel="noreferrer">
                        查看原图
                      </a>
                    ) : "-"}
                  </td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.order.orderNo}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.productName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{item.partName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.part.partCode || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.part.specification || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.part.material || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.surfaceTreatment || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.color || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.outsourceQuantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.returnedQuantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.missingQuantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.status}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{item.remark || "-"}</td>
                </tr>
              ))}
              {outsourceOrder.items.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={15}>暂无外发明细。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">回厂记录</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">回厂日期</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">经手人</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">明细数</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">回厂数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">异常数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">备注</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {outsourceOrder.returns.map((returnOrder) => {
                const totalReturnQuantity = returnOrder.items.reduce((sum, item) => sum + item.returnQuantity, 0);
                const totalAbnormalQuantity = returnOrder.items.reduce((sum, item) => sum + item.abnormalQuantity, 0);
                return (
                  <tr key={returnOrder.id} className="align-top">
                    <td className="border-b border-[#eef2f6] px-3 py-3">{formatDisplayDate(returnOrder.returnDate)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{returnOrder.handler || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{returnOrder.items.length}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{totalReturnQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{totalAbnormalQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{returnOrder.remark || "-"}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">
                      <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={`/returns/${returnOrder.id}`}>
                        详情
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {outsourceOrder.returns.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={7}>暂无回厂记录。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
