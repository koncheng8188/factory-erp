import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { getProductPartStatusLabel, isProductPartStatus, productPartStatusOptions } from "@/lib/product-part-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PartsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatEmpty(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

function DrawingPreview({
  thumbnailUrl,
  fileName,
  drawingCount
}: {
  thumbnailUrl: string | null | undefined;
  fileName: string | null | undefined;
  drawingCount: number;
}) {
  if (thumbnailUrl) {
    return <img className="h-16 w-20 rounded-md border border-[#d8dde6] object-contain" src={thumbnailUrl} alt={fileName ?? "部件图纸"} />;
  }

  if (drawingCount > 0) {
    return (
      <div className="flex h-16 w-20 items-center justify-center rounded-md border border-[#d8dde6] bg-[#eef2f6] text-xs font-semibold text-[#475467]">
        {drawingCount} 张
      </div>
    );
  }

  return (
    <div className="flex h-16 w-20 items-center justify-center rounded-md border border-dashed border-[#cfd6e1] bg-[#f6f7f9] text-xs text-[#667085]">
      无图纸
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#d8dde6] bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-[#667085]">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-[#172033]">{value}</div>
    </div>
  );
}

export default async function PartsPage({ searchParams }: PartsPageProps) {
  const params = await searchParams;
  const keyword = firstQueryValue(params?.keyword).trim();
  const rawStatus = firstQueryValue(params?.status).trim();
  const status = isProductPartStatus(rawStatus) ? rawStatus : "";
  const where: Prisma.ProductPartWhereInput = {};

  if (keyword) {
    where.OR = [
      { partCode: { contains: keyword } },
      { partName: { contains: keyword } },
      { material: { contains: keyword } },
      { surfaceTreatment: { contains: keyword } },
      { specification: { contains: keyword } },
      { order: { is: { orderNo: { contains: keyword } } } },
      { order: { is: { customer: { is: { name: { contains: keyword } } } } } },
      { product: { is: { productName: { contains: keyword } } } }
    ];
  }

  if (status) {
    where.status = status;
  }

  const parts = await prisma.productPart.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      order: {
        include: {
          customer: true
        }
      },
      product: true,
      drawings: {
        orderBy: [{ isMain: "desc" }, { version: "desc" }, { createdAt: "desc" }]
      }
    }
  });

  const statusCounts = new Map(productPartStatusOptions.map((option) => [option.value, 0]));
  for (const part of parts) {
    statusCounts.set(part.status, (statusCounts.get(part.status) ?? 0) + 1);
  }
  const withoutDrawings = parts.filter((part) => part.drawings.length === 0).length;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">部件管理</h1>
        <p className="mt-2 text-sm text-[#667085]">查看所有订单产品下的部件、图纸、外发和回厂数量。</p>
      </section>

      <section className="rounded-lg border border-[#d8dde6] bg-white p-5 shadow-sm">
        <form className="grid gap-4 lg:grid-cols-[1fr_220px_auto_auto]" action="/parts">
          <label className="block text-sm font-medium">
            关键词
            <input
              className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2"
              name="keyword"
              placeholder="订单号、客户、产品、部件、材质、表面处理"
              defaultValue={keyword}
            />
          </label>
          <label className="block text-sm font-medium">
            状态
            <select className="mt-1 w-full rounded-md border border-[#cfd6e1] px-3 py-2" name="status" defaultValue={status}>
              <option value="">全部状态</option>
              {productPartStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className="w-full rounded-md bg-[#172033] px-4 py-2 text-sm font-semibold text-white hover:bg-[#344054]">
              查询
            </button>
          </div>
          <div className="flex items-end">
            <Link className="w-full rounded-md border border-[#cfd6e1] px-4 py-2 text-center text-sm font-semibold text-[#344054] hover:bg-[#f6f7f9]" href="/parts">
              清空
            </Link>
          </div>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
        <StatCard title="部件总数" value={parts.length} />
        <StatCard title="待外发数量" value={statusCounts.get("WAIT_OUTSOURCE") ?? 0} />
        <StatCard title="外发中数量" value={statusCounts.get("OUTSOURCING") ?? 0} />
        <StatCard title="部分回厂数量" value={statusCounts.get("PARTIAL_RETURN") ?? 0} />
        <StatCard title="已回厂数量" value={statusCounts.get("RETURNED") ?? 0} />
        <StatCard title="异常数量" value={statusCounts.get("ABNORMAL") ?? 0} />
        <StatCard title="无图纸数量" value={withoutDrawings} />
      </section>

      <section className="rounded-lg border border-[#d8dde6] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">部件列表</h2>
          <div className="text-sm text-[#667085]">共 {parts.length} 条</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1680px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">图纸</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">客户名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件编号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">规格</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">材质</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">表面处理</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">颜色</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">单件用量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">总数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">已外发</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">已回</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">未回</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">图纸数量</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => {
                const mainDrawing = part.drawings[0];
                return (
                  <tr key={part.id} className="align-top">
                    <td className="border-b border-[#eef2f6] px-3 py-3">
                      <DrawingPreview thumbnailUrl={mainDrawing?.thumbnailUrl} fileName={mainDrawing?.fileName} drawingCount={part.drawings.length} />
                    </td>
                    <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{part.order.orderNo}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{part.order.customer.name}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{part.product.productName}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{formatEmpty(part.partCode)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{part.partName}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{formatEmpty(part.specification)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{formatEmpty(part.material)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{formatEmpty(part.surfaceTreatment)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{formatEmpty(part.color)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{part.productQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{part.unitQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{part.totalQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{part.outsourcedQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{part.returnedQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{part.missingQuantity}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{getProductPartStatusLabel(part.status)}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">{part.drawings.length}</td>
                    <td className="border-b border-[#eef2f6] px-3 py-3">
                      <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm font-medium text-[#344054] hover:bg-[#f6f7f9]" href={`/orders/${part.orderId}`}>
                        查看订单
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {parts.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-[#667085]" colSpan={19}>
                    暂无部件数据，请先在订单详情页添加产品和部件。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
