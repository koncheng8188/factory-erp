import ExcelJS from "exceljs";
import { IMPORT_HEADERS, IMPORT_SHEET_NAME } from "@/lib/import-excel";
import { requireApiUser } from "@/lib/auth/api-user";

export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "金鸿 ERP";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet(IMPORT_SHEET_NAME);

    worksheet.columns = IMPORT_HEADERS.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length * 2 + 4, 14)
    }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    worksheet.addRows([
      {
        订单分组: "O001",
        产品分组: "P001",
        客户名称: "测试客户A",
        联系人: "张三",
        电话: "13800000000",
        地址: "广东佛山",
        客户备注: "",
        订单号: "",
        下单日期: "",
        交货日期: "",
        订单备注: "",
        产品名称: "不锈钢茶几架",
        产品规格: "1200*600",
        产品材质: "304",
        产品数量: 10,
        产品表面处理: "拉丝",
        产品备注: "",
        部件名称: "左脚",
        部件编号: "LJ-001",
        部件规格: "",
        部件材质: "304",
        单套用量: 2,
        部件产品数量: "",
        部件表面处理: "拉丝",
        颜色: "",
        部件备注: ""
      },
      {
        订单分组: "O001",
        产品分组: "P001",
        客户名称: "测试客户A",
        联系人: "张三",
        电话: "13800000000",
        地址: "广东佛山",
        客户备注: "",
        订单号: "",
        下单日期: "",
        交货日期: "",
        订单备注: "",
        产品名称: "不锈钢茶几架",
        产品规格: "1200*600",
        产品材质: "304",
        产品数量: 10,
        产品表面处理: "拉丝",
        产品备注: "",
        部件名称: "右脚",
        部件编号: "RJ-001",
        部件规格: "",
        部件材质: "304",
        单套用量: 2,
        部件产品数量: "",
        部件表面处理: "拉丝",
        颜色: "",
        部件备注: ""
      },
      {
        订单分组: "O001",
        产品分组: "P002",
        客户名称: "测试客户A",
        联系人: "张三",
        电话: "13800000000",
        地址: "广东佛山",
        客户备注: "",
        订单号: "",
        下单日期: "",
        交货日期: "",
        订单备注: "",
        产品名称: "不锈钢横梁",
        产品规格: "1200",
        产品材质: "304",
        产品数量: 10,
        产品表面处理: "拉丝",
        产品备注: "",
        部件名称: "横梁",
        部件编号: "HL-001",
        部件规格: "",
        部件材质: "304",
        单套用量: 4,
        部件产品数量: "",
        部件表面处理: "拉丝",
        颜色: "",
        部件备注: ""
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
