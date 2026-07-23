import { NextRequest, NextResponse } from "next/server";
import { confirmOrderProductImport } from "@/lib/import-order-products";
import { requireApiAllPermissions } from "@/lib/auth/authorization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "order.importProducts",
    "product.view",
    "product.create",
    "part.view",
    "part.create"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : null;

    if (!rows) {
      return NextResponse.json({ error: "缺少待确认导入的数据。" }, { status: 400 });
    }

    const result = await confirmOrderProductImport(id, rows);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "确认导入失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
