import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const orderStatuses = [
  "PENDING",
  "PRODUCING",
  "OUTSOURCING",
  "WAIT_DELIVERY",
  "PARTIAL_DELIVERED",
  "COMPLETED",
  "ABNORMAL"
] as const;

const productionProductStatuses = [
  "PENDING",
  "CUTTING",
  "WELDING",
  "POLISHING",
  "WAIT_OUTSOURCE",
  "OUTSOURCING",
  "PARTIAL_RETURN",
  "RETURNED"
] as const;

const activeOutsourceStatuses = ["OUTSOURCED", "PARTIAL_RETURN"] as const;
const deliverableProductStatuses = ["WAIT_DELIVERY", "PARTIAL_DELIVERED"] as const;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfTomorrow(today: Date) {
  const date = new Date(today);
  date.setDate(date.getDate() + 1);
  return date;
}

function sumNumbers(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function StatCard({
  title,
  value,
  description,
  href,
  tone = "normal"
}: {
  title: string;
  value: number | string;
  description: string;
  href: string;
  tone?: "normal" | "warning" | "danger";
}) {
  const toneClass = {
    normal: "border-[#d8dde6] bg-white",
    warning: "border-amber-300 bg-amber-50",
    danger: "border-red-300 bg-red-50"
  }[tone];

  const valueClass = {
    normal: "text-[#172033]",
    warning: "text-amber-700",
    danger: "text-red-700"
  }[tone];

  return (
    <Link
      href={href}
      className={`block rounded-md border p-5 transition hover:-translate-y-0.5 hover:border-[#98a2b3] hover:shadow-sm ${toneClass}`}
    >
      <div className="text-sm font-medium text-[#667085]">{title}</div>
      <div className={`mt-3 text-3xl font-semibold ${valueClass}`}>{value}</div>
      <div className="mt-2 text-sm leading-6 text-[#667085]">{description}</div>
    </Link>
  );
}

export default async function DashboardPage() {
  const today = startOfToday();
  const tomorrow = startOfTomorrow(today);

  const [
    todayNewOrders,
    activeOrders,
    productionProducts,
    unreturnedOutsourceItems,
    overdueOutsourceOrders,
    todayDueOutsourceOrders,
    partialReturnOutsourceOrders,
    kittingProducts,
    deliverableProducts,
    completedOrders,
    partsWithoutDrawings,
    thumbnailFailedDrawings,
    orderStatusGroups
  ] = await Promise.all([
    prisma.order.count({
      where: {
        createdAt: {
          gte: today,
          lt: tomorrow
        }
      }
    }),
    prisma.order.count({
      where: {
        status: {
          not: "COMPLETED"
        }
      }
    }),
    prisma.product.count({
      where: {
        status: {
          in: [...productionProductStatuses]
        }
      }
    }),
    prisma.outsourceOrderItem.findMany({
      where: {
        missingQuantity: {
          gt: 0
        }
      },
      select: {
        missingQuantity: true
      }
    }),
    prisma.outsourceOrder.count({
      where: {
        expectedReturnDate: {
          lt: today
        },
        status: {
          in: [...activeOutsourceStatuses]
        }
      }
    }),
    prisma.outsourceOrder.count({
      where: {
        expectedReturnDate: {
          gte: today,
          lt: tomorrow
        },
        status: {
          in: [...activeOutsourceStatuses]
        }
      }
    }),
    prisma.outsourceOrder.count({
      where: {
        status: "PARTIAL_RETURN"
      }
    }),
    prisma.product.findMany({
      select: {
        id: true,
        parts: {
          select: {
            totalQuantity: true,
            returnedQuantity: true
          }
        }
      }
    }),
    prisma.product.findMany({
      where: {
        status: {
          in: [...deliverableProductStatuses]
        }
      },
      select: {
        id: true,
        quantity: true,
        deliveryOrderItems: {
          select: {
            deliveryQuantity: true
          }
        }
      }
    }),
    prisma.order.count({
      where: {
        status: "COMPLETED"
      }
    }),
    prisma.productPart.count({
      where: {
        drawings: {
          none: {}
        }
      }
    }),
    prisma.partDrawing.count({
      where: {
        uploadStatus: "THUMBNAIL_FAILED"
      }
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: {
        status: true
      }
    })
  ]);

  const unreturnedOutsourceItemCount = unreturnedOutsourceItems.length;
  const unreturnedOutsourceQuantity = sumNumbers(unreturnedOutsourceItems.map((item) => item.missingQuantity));
  const missingProducts = kittingProducts.filter((product) =>
    product.parts.some((part) => Math.max(part.totalQuantity - part.returnedQuantity, 0) > 0)
  );
  const missingProductCount = missingProducts.length;
  const missingPartQuantity = sumNumbers(
    kittingProducts.flatMap((product) =>
      product.parts.map((part) => Math.max(part.totalQuantity - part.returnedQuantity, 0))
    )
  );
  const pendingDeliveryProducts = deliverableProducts.filter((product) => {
    const deliveredQuantity = sumNumbers(product.deliveryOrderItems.map((item) => item.deliveryQuantity));
    return Math.max(product.quantity - deliveredQuantity, 0) > 0;
  });
  const pendingDeliveryProductCount = pendingDeliveryProducts.length;
  const pendingDeliveryQuantity = sumNumbers(
    deliverableProducts.map((product) => {
      const deliveredQuantity = sumNumbers(product.deliveryOrderItems.map((item) => item.deliveryQuantity));
      return Math.max(product.quantity - deliveredQuantity, 0);
    })
  );
  const orderStatusCountMap = new Map(orderStatusGroups.map((group) => [group.status, group._count.status]));

  const statGroups = [
    {
      title: "订单概况",
      cards: [
        {
          title: "今日新增订单",
          value: todayNewOrders,
          description: "今天创建的订单数量",
          href: "/orders"
        },
        {
          title: "进行中订单",
          value: activeOrders,
          description: "除已完成外的全部订单",
          href: "/orders"
        },
        {
          title: "已完成订单",
          value: completedOrders,
          description: "状态为 COMPLETED 的订单",
          href: "/orders"
        }
      ]
    },
    {
      title: "生产与齐套",
      cards: [
        {
          title: "生产中产品",
          value: productionProducts,
          description: "未完成且未进入待送货的产品",
          href: "/production"
        },
        {
          title: "缺件产品",
          value: missingProductCount,
          description: `仍缺 ${missingPartQuantity} 件部件`,
          href: "/kitting",
          tone: "warning" as const
        },
        {
          title: "无图纸部件",
          value: partsWithoutDrawings,
          description: "没有绑定图纸的部件",
          href: "/drawings"
        },
        {
          title: "缩略图生成失败",
          value: thumbnailFailedDrawings,
          description: "需要重新处理缩略图的图纸",
          href: "/drawings",
          tone: "danger" as const
        }
      ]
    },
    {
      title: "外发与回厂",
      cards: [
        {
          title: "外发未回",
          value: unreturnedOutsourceItemCount,
          description: `未回总件数 ${unreturnedOutsourceQuantity}`,
          href: "/outsourcing"
        },
        {
          title: "外发超期未回",
          value: overdueOutsourceOrders,
          description: "预计回厂日期早于今天",
          href: "/outsourcing",
          tone: "danger" as const
        },
        {
          title: "今日应回外发",
          value: todayDueOutsourceOrders,
          description: "预计今天回厂的外发单",
          href: "/outsourcing",
          tone: "warning" as const
        },
        {
          title: "部分回厂",
          value: partialReturnOutsourceOrders,
          description: "状态为 PARTIAL_RETURN 的外发单",
          href: "/returns"
        }
      ]
    },
    {
      title: "送货提醒",
      cards: [
        {
          title: "待送货产品",
          value: pendingDeliveryProductCount,
          description: `未送总数量 ${pendingDeliveryQuantity}`,
          href: "/delivery",
          tone: "warning" as const
        }
      ]
    }
  ];

  const quickLinks = [
    { label: "新建订单", href: "/orders" },
    { label: "外发电镀", href: "/outsourcing" },
    { label: "回厂登记", href: "/returns" },
    { label: "齐套检查", href: "/kitting" },
    { label: "送货管理", href: "/delivery" },
    { label: "图纸管理", href: "/drawings" }
  ];

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">金鸿 ERP 首页看板</h1>
        <p className="mt-2 text-sm text-[#667085]">
          汇总订单、生产、外发、回厂、齐套、送货和图纸的关键提醒。
        </p>
      </section>

      {statGroups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-lg font-semibold">{group.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {group.cards.map((card) => (
              <StatCard key={card.title} {...card} />
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">订单状态统计</h2>
          <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/orders">
            查看订单
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {orderStatuses.map((status) => (
            <Link
              key={status}
              href="/orders"
              className="rounded-md border border-[#d8dde6] bg-[#f6f7f9] p-4 transition hover:border-[#98a2b3] hover:bg-white"
            >
              <div className="break-words text-xs font-medium text-[#667085]">{status}</div>
              <div className="mt-2 text-2xl font-semibold">{orderStatusCountMap.get(status) ?? 0}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">快捷入口</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md border border-[#cfd6e1] px-4 py-3 text-sm font-medium transition hover:border-[#98a2b3] hover:bg-[#f6f7f9]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
