import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { withProtectedOutsourceDrawingUrls } from "@/lib/drawing-file-url";
import { hasPermission } from "@/lib/permissions";
import { ReturnCreateManager } from "./return-create-manager";

export const dynamic = "force-dynamic";

type NewReturnPageProps = {
  searchParams: Promise<{ outsourceOrderId?: string }>;
};

export default async function NewReturnPage({ searchParams }: NewReturnPageProps) {
  const user = await requirePagePermission("return.view");
  const canCreateOutsourceReturn =
    hasPermission(user.role, "order.view", []) &&
    hasPermission(user.role, "product.view", []) &&
    hasPermission(user.role, "part.view", []) &&
    hasPermission(user.role, "drawing.view", []) &&
    hasPermission(user.role, "outsource.view", []) &&
    hasPermission(user.role, "return.view", []) &&
    hasPermission(user.role, "return.create", []);

  if (!canCreateOutsourceReturn) {
    return (
      <div className="space-y-6">
        <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/returns">
          返回回厂记录列表
        </Link>
        <section className="rounded-md border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          没有登记回厂的权限。
        </section>
      </div>
    );
  }

  const { outsourceOrderId } = await searchParams;

  if (!outsourceOrderId) {
    return (
      <div className="space-y-6">
        <section>
          <h1 className="text-2xl font-semibold">外发回厂登记</h1>
          <p className="mt-2 text-sm text-[#667085]">请从外发单详情页进入回厂登记。</p>
        </section>
        <section className="rounded-md border border-[#d8dde6] bg-white p-5">
          <Link className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium" href="/outsourcing">
            返回外发单列表
          </Link>
        </section>
      </div>
    );
  }

  const outsourceOrder = await prisma.outsourceOrder.findUnique({
    where: { id: outsourceOrderId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
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
      }
    }
  });

  if (!outsourceOrder) {
    return (
      <div className="space-y-6">
        <section>
          <h1 className="text-2xl font-semibold">外发回厂登记</h1>
          <p className="mt-2 text-sm text-[#667085]">外发单不存在，请返回外发单列表重新选择。</p>
        </section>
        <section className="rounded-md border border-[#d8dde6] bg-white p-5">
          <Link className="rounded-md border border-[#cfd6e1] px-4 py-2 text-sm font-medium" href="/outsourcing">
            返回外发单列表
          </Link>
        </section>
      </div>
    );
  }

  return (
    <ReturnCreateManager
      canCreateOutsourceReturn={canCreateOutsourceReturn}
      outsourceOrder={{
        id: outsourceOrder.id,
        outsourceNo: outsourceOrder.outsourceNo,
        supplierName: outsourceOrder.supplierName,
        outsourceType: outsourceOrder.outsourceType,
        outsourceDate: outsourceOrder.outsourceDate.toISOString(),
        expectedReturnDate: outsourceOrder.expectedReturnDate?.toISOString() ?? null,
        status: outsourceOrder.status,
        handler: outsourceOrder.handler,
        remark: outsourceOrder.remark,
        items: outsourceOrder.items.map((item) => ({
          ...withProtectedOutsourceDrawingUrls(item),
          id: item.id,
          productName: item.productName,
          partName: item.partName,
          partCode: item.part.partCode,
          specification: item.part.specification,
          material: item.part.material,
          surfaceTreatment: item.surfaceTreatment,
          color: item.color,
          outsourceQuantity: item.outsourceQuantity,
          returnedQuantity: item.returnedQuantity,
          missingQuantity: item.missingQuantity,
          drawing: item.drawing
        }))
      }}
    />
  );
}
