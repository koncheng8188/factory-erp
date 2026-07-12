import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DataStat = {
  label: string;
  count: number;
  description: string;
};

type StatGroup = {
  title: string;
  description: string;
  items: DataStat[];
};

const backupTarget = "C:\\金鸿ERP备份";

const readinessChecklist = [
  "已完成最新系统备份",
  "已确认备份目录中存在 dev.db",
  "已确认备份目录中存在 uploads",
  "已确认哪些客户属于测试数据",
  "已确认哪些订单属于测试数据",
  "已确认没有正式订单混在测试数据中",
  "已完成一条订单全流程测试",
  "已测试生产任务单、外发单、回厂单和送货单打印",
  "已确认系统日期和电脑时间正确",
  "已确认正式使用人员知道系统备份入口"
];

const deletionOrder = [
  "回厂明细 OutsourceReturnItem",
  "回厂记录 OutsourceReturn",
  "送货明细 DeliveryOrderItem",
  "送货单 DeliveryOrder",
  "生产进度日志 ProductPartProgressLog",
  "生产异常 ProductPartAbnormal",
  "外发明细 OutsourceOrderItem",
  "外发单 OutsourceOrder",
  "图纸 PartDrawing",
  "部件 ProductPart",
  "产品 Product",
  "订单 Order",
  "客户 Customer"
];

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DataManagementPage() {
  await requirePagePermission("dataManagement.view");

  const databasePath = path.join(process.cwd(), "prisma", "dev.db");
  const [
    customerCount,
    orderCount,
    productCount,
    productPartCount,
    partDrawingCount,
    outsourceOrderCount,
    outsourceOrderItemCount,
    outsourceReturnCount,
    outsourceReturnItemCount,
    deliveryOrderCount,
    deliveryOrderItemCount,
    productPartProgressLogCount,
    productPartAbnormalCount,
    databaseFileResult
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.order.count(),
    prisma.product.count(),
    prisma.productPart.count(),
    prisma.partDrawing.count(),
    prisma.outsourceOrder.count(),
    prisma.outsourceOrderItem.count(),
    prisma.outsourceReturn.count(),
    prisma.outsourceReturnItem.count(),
    prisma.deliveryOrder.count(),
    prisma.deliveryOrderItem.count(),
    prisma.productPartProgressLog.count(),
    prisma.productPartAbnormal.count(),
    fs.stat(databasePath).then(
      (stat) => ({ available: true as const, stat }),
      () => ({ available: false as const })
    )
  ]);

  const statGroups: StatGroup[] = [
    {
      title: "核心业务数据",
      description: "客户、订单及产品结构基础数据",
      items: [
        { label: "客户", count: customerCount, description: "订单所属的客户资料" },
        { label: "订单", count: orderCount, description: "生产和交付的业务订单" },
        { label: "产品", count: productCount, description: "订单下的产品记录" },
        { label: "部件", count: productPartCount, description: "产品拆分后的生产部件" },
        { label: "图纸", count: partDrawingCount, description: "部件关联的图纸记录" }
      ]
    },
    {
      title: "外发与回厂",
      description: "外发加工和回厂登记过程数据",
      items: [
        { label: "外发单", count: outsourceOrderCount, description: "外发加工业务单据" },
        { label: "外发明细", count: outsourceOrderItemCount, description: "外发单中的部件明细" },
        { label: "回厂记录", count: outsourceReturnCount, description: "外发加工回厂登记" },
        { label: "回厂明细", count: outsourceReturnItemCount, description: "回厂记录中的部件明细" }
      ]
    },
    {
      title: "送货数据",
      description: "订单送货和出库过程数据",
      items: [
        { label: "送货单", count: deliveryOrderCount, description: "客户送货业务单据" },
        { label: "送货明细", count: deliveryOrderItemCount, description: "送货单中的产品明细" }
      ]
    },
    {
      title: "生产过程记录",
      description: "生产进度与异常处理记录",
      items: [
        { label: "生产进度日志", count: productPartProgressLogCount, description: "部件生产工序进度记录" },
        { label: "生产异常记录", count: productPartAbnormalCount, description: "生产过程中的异常登记" }
      ]
    }
  ];

  const coreBusinessTotal = statGroups[0].items.reduce((total, item) => total + item.count, 0);
  const processRecordTotal = statGroups.slice(1).flatMap((group) => group.items).reduce((total, item) => total + item.count, 0);
  const overallTotal = coreBusinessTotal + processRecordTotal;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">数据管理与正式使用前检查</h1>
        <p className="mt-2 text-sm text-[#667085]">
          用于查看当前系统数据规模、备份保护情况和正式使用前注意事项。当前版本只提供查看功能，不提供数据删除、清空或重置。
        </p>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">实时数据统计</h2>
        <p className="mt-1 text-sm text-[#667085]">以下合计仅用于了解数据规模，不代表订单数量或产品数量。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-[#dce4ee] bg-[#f6f7f9] p-4">
            <div className="text-sm font-medium text-[#667085]">核心业务数据总数</div>
            <div className="mt-2 text-2xl font-semibold text-[#172033]">{coreBusinessTotal}</div>
          </div>
          <div className="rounded-md border border-[#dce4ee] bg-[#f6f7f9] p-4">
            <div className="text-sm font-medium text-[#667085]">流程记录总数</div>
            <div className="mt-2 text-2xl font-semibold text-[#172033]">{processRecordTotal}</div>
          </div>
          <div className="rounded-md border border-[#dce4ee] bg-[#f6f7f9] p-4">
            <div className="text-sm font-medium text-[#667085]">全部统计总数</div>
            <div className="mt-2 text-2xl font-semibold text-[#172033]">{overallTotal}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {statGroups.map((group) => (
            <div key={group.title} className="rounded-md border border-[#eef2f6] p-4">
              <h3 className="font-semibold text-[#172033]">{group.title}</h3>
              <p className="mt-1 text-sm text-[#667085]">{group.description}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {group.items.map((item) => (
                  <div key={item.label} className="rounded-md bg-[#f6f7f9] p-3">
                    <div className="font-medium text-[#172033]">{item.label}</div>
                    <div className="mt-1 text-lg font-semibold text-[#172033]">当前 {item.count} 条</div>
                    <div className="mt-1 text-xs leading-5 text-[#667085]">{item.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">数据库信息</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-4">
            <div className="font-medium text-[#667085]">当前数据库类型</div>
            <div className="mt-2 text-[#172033]">SQLite</div>
          </div>
          <div className="rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-4">
            <div className="font-medium text-[#667085]">当前数据库位置</div>
            <div className="mt-2 break-all font-mono text-[#172033]">{databasePath}</div>
          </div>
          {databaseFileResult.available ? (
            <>
              <div className="rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-4">
                <div className="font-medium text-[#667085]">文件状态</div>
                <div className="mt-2 text-emerald-700">文件存在</div>
              </div>
              <div className="rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-4">
                <div className="font-medium text-[#667085]">文件大小</div>
                <div className="mt-2 text-[#172033]">{formatFileSize(databaseFileResult.stat.size)}</div>
              </div>
              <div className="rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-4 md:col-span-2">
                <div className="font-medium text-[#667085]">最后修改时间</div>
                <div className="mt-2 text-[#172033]">
                  {databaseFileResult.stat.mtime.toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-800 md:col-span-2">暂时无法读取数据库文件信息</div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-semibold text-amber-900">备份保护提醒</h2>
        <p className="mt-2 font-medium text-amber-900">在进行任何正式数据整理前，必须先完成系统备份。</p>
        <p className="mt-2 text-sm text-amber-800">当前备份功能会保存 prisma/dev.db、public/uploads、未来启用的 storage/uploads 和 backup-info.txt。</p>
        <div className="mt-3 break-all rounded-md border border-amber-200 bg-white/70 px-3 py-2 font-mono text-sm text-[#172033]">{backupTarget}</div>
        <Link
          href="/settings/backup"
          className="mt-4 inline-flex rounded-md bg-[#172033] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#344054] hover:text-white"
        >
          前往系统备份
        </Link>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">正式使用前检查清单</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {readinessChecklist.map((item, index) => (
            <div key={item} className="flex items-start gap-3 rounded-md border border-[#eef2f6] bg-[#f6f7f9] p-3 text-sm text-[#344054]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#667085]">{index + 1}</span>
              <span className="pt-0.5">{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-red-200 bg-red-50 p-5">
        <h2 className="text-lg font-semibold text-red-800">数据清理风险说明</h2>
        <div className="mt-3 space-y-1 text-sm leading-6 text-red-800">
          <p>当前系统没有“测试数据”和“正式数据”标记。</p>
          <p>直接批量删除可能误删正式数据。</p>
          <p className="font-medium">当前版本不提供一键清空、恢复出厂设置或重置数据库功能。</p>
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">推荐删除顺序</h2>
        <p className="mt-1 text-sm text-[#667085]">此顺序仅用于风险说明，当前页面不会执行任何删除操作。</p>
        <ol className="mt-4 grid gap-2 text-sm text-[#344054] md:grid-cols-2">
          {deletionOrder.map((item, index) => (
            <li key={item} className="flex gap-3 rounded-md border border-[#eef2f6] bg-[#f6f7f9] px-3 py-2.5">
              <span className="font-semibold text-[#667085]">{index + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">当前版本功能限制</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="font-semibold text-emerald-800">当前版本支持</h3>
            <ul className="mt-3 space-y-2 text-sm text-emerald-800">
              <li>查看数据统计</li>
              <li>查看数据库信息</li>
              <li>前往系统备份</li>
              <li>查看正式使用前检查清单</li>
              <li>查看数据删除风险</li>
            </ul>
          </div>
          <div className="rounded-md border border-[#dce4ee] bg-[#f6f7f9] p-4">
            <h3 className="font-semibold text-[#344054]">当前版本不支持</h3>
            <ul className="mt-3 space-y-2 text-sm text-[#475467]">
              <li>清空测试数据</li>
              <li>删除全部订单</li>
              <li>删除全部客户</li>
              <li>重置数据库</li>
              <li>恢复出厂设置</li>
              <li>自动生成演示数据</li>
              <li>从备份恢复数据</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
