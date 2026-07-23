import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAllPermissions } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { ImportProductsManager } from "./import-products-manager";

export const dynamic = "force-dynamic";

type ImportProductsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ImportProductsPage({ params }: ImportProductsPageProps) {
  const user = await requirePageAllPermissions(["order.view", "order.importProducts"]);
  const canExecuteOrderProductImport =
    hasPermission(user.role, "order.view", []) &&
    hasPermission(user.role, "order.importProducts", []) &&
    hasPermission(user.role, "product.view", []) &&
    hasPermission(user.role, "product.create", []) &&
    hasPermission(user.role, "part.view", []) &&
    hasPermission(user.role, "part.create", []);
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id }, { orderNo: id }]
    },
    select: {
      id: true,
      orderNo: true,
      customerName: true
    }
  });

  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href={`/orders/${order.id}`}>
          返回订单详情
        </Link>
      </div>
      <section>
        <h1 className="text-2xl font-semibold">导入产品部件</h1>
        <p className="mt-2 text-sm text-[#667085]">在当前订单下通过 Excel 导入产品和部件，不会创建客户或订单。</p>
      </section>
      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">当前订单</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[#667085]">订单号</dt>
            <dd className="mt-1 font-medium">{order.orderNo}</dd>
          </div>
          <div>
            <dt className="text-[#667085]">客户名称</dt>
            <dd className="mt-1 font-medium">{order.customerName}</dd>
          </div>
        </dl>
      </section>
      <ImportProductsManager orderId={order.id} canExecuteOrderProductImport={canExecuteOrderProductImport} />
    </div>
  );
}
