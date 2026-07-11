import { NextRequest, NextResponse } from "next/server";
import { confirmSimpleImportRows } from "@/lib/import-excel-simple";
import { requireApiUser } from "@/lib/auth/api-user";

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  try {
    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : null;

    if (!rows) {
      return NextResponse.json({ error: "缺少待确认导入的数据。" }, { status: 400 });
    }

    const result = await confirmSimpleImportRows(rows);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "确认导入失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
