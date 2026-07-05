import { NextRequest, NextResponse } from "next/server";
import { confirmImportRows } from "@/lib/import-excel";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : null;

    if (!rows) {
      return NextResponse.json({ error: "缺少待确认导入的数据。" }, { status: 400 });
    }

    const result = await confirmImportRows(rows);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "确认导入失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
