import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { withProtectedDrawingUrls } from "@/lib/drawing-file-url";

export const dynamic = "force-dynamic";

const drawingStatusLabels: Record<string, string> = {
  PENDING: "待确认",
  CONFIRMED: "已确认",
  OBSOLETE: "已作废"
};

const uploadStatusLabels: Record<string, string> = {
  UPLOADED: "已上传",
  PROCESSING: "处理中",
  READY: "可用",
  FAILED: "失败",
  THUMBNAIL_FAILED: "缩略图生成失败"
};

function statusLabel(labels: Record<string, string>, value: string) {
  return labels[value] ?? value;
}

function DrawingPreview({ thumbnailUrl, fileName }: { thumbnailUrl: string | null; fileName: string }) {
  if (thumbnailUrl) {
    return <img className="h-16 w-20 rounded border border-[#d8dde6] object-contain" src={thumbnailUrl} alt={fileName} />;
  }

  return (
    <div className="flex h-16 w-20 items-center justify-center rounded border border-[#d8dde6] bg-[#eef2f6] text-xs font-semibold text-[#475467]">
      PDF
    </div>
  );
}

export default async function DrawingsPage() {
  await requirePagePermission("drawing.view");

  const drawings = (await prisma.partDrawing.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      order: { select: { id: true, orderNo: true } },
      product: { select: { productName: true } },
      part: { select: { partName: true } }
    }
  })).map(withProtectedDrawingUrls);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">图纸管理</h1>
        <p className="mt-2 text-sm text-[#667085]">查看所有已上传的部件图纸、缩略图、主图和状态。</p>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">图纸列表</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">缩略图</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">部件名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">文件名</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">版本</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">是否主图</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">上传状态</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">查看原图</th>
              </tr>
            </thead>
            <tbody>
              {drawings.map((drawing) => (
                <tr key={drawing.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <a href={drawing.originalUrl} target="_blank" rel="noreferrer">
                      <DrawingPreview thumbnailUrl={drawing.thumbnailUrl} fileName={drawing.fileName} />
                    </a>
                  </td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <Link className="font-medium text-[#172033] hover:underline" href={`/orders/${drawing.order.id}`}>
                      {drawing.order.orderNo}
                    </Link>
                  </td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{drawing.product.productName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{drawing.part.partName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <div className="font-medium">{drawing.fileName}</div>
                    {drawing.errorMessage ? <div className="mt-1 text-xs text-red-700">{drawing.errorMessage}</div> : null}
                  </td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">V{drawing.version}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{drawing.isMain ? "是" : "否"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{statusLabel(drawingStatusLabels, drawing.status)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{statusLabel(uploadStatusLabels, drawing.uploadStatus)}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <a className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={drawing.originalUrl} target="_blank" rel="noreferrer">
                      查看原图
                    </a>
                  </td>
                </tr>
              ))}
              {drawings.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={10}>
                    暂无图纸，请先在订单详情页的部件下上传图纸。
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
