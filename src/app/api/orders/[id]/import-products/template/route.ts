import ExcelJS from "exceljs";
import { ORDER_PRODUCT_IMPORT_HEADERS, ORDER_PRODUCT_IMPORT_SHEET_NAME } from "@/lib/import-order-products";

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "金鸿 ERP";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet(ORDER_PRODUCT_IMPORT_SHEET_NAME);

    worksheet.columns = ORDER_PRODUCT_IMPORT_HEADERS.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length * 2 + 6, 16)
    }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    worksheet.addRows([
      {
        产品名称: "不锈钢茶几架",
        规格: "1200*600",
        材质: "304",
        数量: 10,
        表面处理: "黑钛",
        颜色: "黑钛",
        产品备注: "测试产品",
        部件清单: "左脚*2;右脚*2;横梁*4;连接片*8"
      },
      {
        产品名称: "不锈钢展示架",
        规格: "2000*800",
        材质: "201",
        数量: 3,
        表面处理: "喷粉黑色",
        颜色: "黑色",
        产品备注: "整件产品示例",
        部件清单: "整件*1"
      }
    ]);

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFD8DDE6" } },
          left: { style: "thin", color: { argb: "FFD8DDE6" } },
          bottom: { style: "thin", color: { argb: "FFD8DDE6" } },
          right: { style: "thin", color: { argb: "FFD8DDE6" } }
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = encodeURIComponent("订单产品部件导入模板.xlsx");

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "下载模板失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}
