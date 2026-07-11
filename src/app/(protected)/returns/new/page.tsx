import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { withProtectedOutsourceDrawingUrls } from "@/lib/drawing-file-url";
import { ReturnCreateManager } from "./return-create-manager";

export const dynamic = "force-dynamic";

type NewReturnPageProps = {
  searchParams: Promise<{ outsourceOrderId?: string }>;
};

export default async function NewReturnPage({ searchParams }: NewReturnPageProps) {
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
