import { NextRequest, NextResponse } from "next/server";
import {
  ORDER_PRODUCT_IMPORT_MAX_FILE_SIZE,
  parseOrderProductWorkbook,
  validateOrderProductRows
} from "@/lib/import-order-products";
import { requireApiAllPermissions } from "@/lib/auth/authorization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await requireApiAllPermissions([
    "order.view",
    "order.importProducts"
  ]);
  if (!authResult.ok) return authResult.response;
  try {
    const { id } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传 .xlsx 文件。" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "只支持 .xlsx 文件。" }, { status: 400 });
    }
    if (file.size > ORDER_PRODUCT_IMPORT_MAX_FILE_SIZE) {
      return NextResponse.json({ error: "文件不能超过 5MB。" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await parseOrderProductWorkbook(buffer);
    const preview = await validateOrderProductRows(id, rows);

    return NextResponse.json({ ...preview, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析 Excel 失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
