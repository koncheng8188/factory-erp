import ExcelJS from "exceljs";
import { SIMPLE_IMPORT_HEADERS, SIMPLE_IMPORT_SHEET_NAME } from "@/lib/import-excel-simple";

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "金鸿 ERP";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet(SIMPLE_IMPORT_SHEET_NAME);

    worksheet.columns = SIMPLE_IMPORT_HEADERS.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length * 2 + 6, 16)
    }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    worksheet.addRows([
      {
        订单分组: "A001",
        客户名称: "张三客户",
        联系人: "张三",
        电话: "13800000000",
        地址: "深圳",
        客户备注: "测试客户",
        订单号: "",
        下单日期: "2026/7/1",
        交货日期: "2026/8/1",
        订单备注: "测试订单",
        产品名称: "不锈钢茶几架",
        产品规格: "1200*600",
        产品材质: "304",
        产品数量: 10,
        产品表面处理: "黑钛",
        颜色: "黑钛",
        产品备注: "测试产品",
        部件清单: "左脚*2;右脚*2;横梁*4"
      },
      {
        订单分组: "",
        客户名称: "",
        联系人: "",
        电话: "",
        地址: "",
        客户备注: "",
        订单号: "",
        下单日期: "",
        交货日期: "",
        订单备注: "",
        产品名称: "不锈钢边几",
        产品规格: "500*500",
        产品材质: "304",
        产品数量: 5,
        产品表面处理: "拉丝",
        颜色: "本色",
        产品备注: "整件产品",
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
    const filename = encodeURIComponent("全局简易导入模板.xlsx");

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
