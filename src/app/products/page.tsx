import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      order: { select: { id: true, orderNo: true, customerName: true } }
    }
  });

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">产品管理</h1>
        <p className="mt-2 text-sm text-[#667085]">查看订单下的产品明细，新增和编辑请进入订单详情页操作。</p>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">产品列表</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[#f6f7f9] text-[#475467]">
              <tr>
                <th className="border-b border-[#d8dde6] px-3 py-3">产品名称</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">订单号</th>
                <th className="border-b border-[#d8dde6] px-3 py-3">客户名称</th>
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
              {products.map((product) => (
                <tr key={product.id} className="align-top">
                  <td className="border-b border-[#eef2f6] px-3 py-3 font-medium">{product.productName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.order.orderNo}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.order.customerName}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.specification || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.material || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.quantity}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.surfaceTreatment || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.status}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">{product.remark || "-"}</td>
                  <td className="border-b border-[#eef2f6] px-3 py-3">
                    <Link className="rounded-md border border-[#cfd6e1] px-3 py-1.5 text-sm" href={`/orders/${product.order.id}`}>
                      订单详情
                    </Link>
                  </td>
                </tr>
              ))}
              {products.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#667085]" colSpan={10}>
                    暂无产品，请先在订单详情页新增产品。
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
