import { NextRequest, NextResponse } from "next/server";
import { MAX_IMPORT_FILE_SIZE, parseImportWorkbook, validateImportRows } from "@/lib/import-excel";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传 .xlsx 文件。" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "只支持 .xlsx 文件。" }, { status: 400 });
    }
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      return NextResponse.json({ error: "文件不能超过 5MB。" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await parseImportWorkbook(buffer);
    const preview = await validateImportRows(rows);

    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析 Excel 失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
