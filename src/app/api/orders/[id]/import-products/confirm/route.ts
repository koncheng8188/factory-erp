import { NextRequest, NextResponse } from "next/server";
import { confirmOrderProductImport } from "@/lib/import-order-products";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
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
