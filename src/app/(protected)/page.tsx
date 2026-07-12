import Link from "next/link";
import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { outsourceTypeLabels } from "@/lib/outsource";
import { getOrderStatusLabel } from "@/lib/order-status";
import { card, pageDescription, pageHeader, pageShell, pageTitle, sectionTitle, statCard } from "@/lib/ui-styles";

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
const dayMilliseconds = 24 * 60 * 60 * 1000;

const productStatusLabels = {
  PENDING: "待处理",
  CUTTING: "下料中",
  WELDING: "焊接中",
  POLISHING: "打磨中",
  WAIT_OUTSOURCE: "待外发",
  OUTSOURCING: "外发中",
  PARTIAL_RETURN: "部分回厂",
  RETURNED: "已回厂",
  WAIT_DELIVERY: "待送货",
  PARTIAL_DELIVERED: "部分送货",
  COMPLETED: "已完成",
  ABNORMAL: "异常"
} as const;

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

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOverdueDays(today: Date, expectedReturnDate: Date | string | null) {
  if (!expectedReturnDate) return 0;
  const date = new Date(expectedReturnDate);
  date.setHours(0, 0, 0, 0);
  return Math.max(Math.floor((today.getTime() - date.getTime()) / dayMilliseconds), 0);
}

function getProductStatusLabel(status: string) {
  return productStatusLabels[status as keyof typeof productStatusLabels] ?? status;
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
      className={`block rounded-lg border p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#98a2b3] hover:shadow-md ${toneClass}`}
    >
      <div className="text-sm font-medium text-[#667085]">{title}</div>
      <div className={`mt-3 text-3xl font-semibold ${valueClass}`}>{value}</div>
      <div className="mt-2 text-sm leading-6 text-[#667085]">{description}</div>
    </Link>
  );
}

function TodoCard({
  title,
  count,
  href,
  tone = "normal",
  hasItems,
  children
}: {
  title: string;
  count: number;
  href: string;
  tone?: "normal" | "warning" | "danger" | "info" | "muted" | "orange";
  hasItems: boolean;
  children: ReactNode;
}) {
  const toneClass = {
    normal: "border-[#d8dde6]",
    warning: "border-amber-300",
    danger: "border-red-300",
    info: "border-blue-300",
    muted: "border-slate-300",
    orange: "border-orange-300"
  }[tone];

  const countClass = {
    normal: "text-[#172033]",
    warning: "text-amber-700",
    danger: "text-red-700",
    info: "text-blue-700",
    muted: "text-slate-700",
    orange: "text-orange-700"
  }[tone];

  return (
    <section className={`rounded-lg border bg-white p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <div className={`mt-2 text-2xl font-semibold ${countClass}`}>{count}</div>
        </div>
        <Link className="shrink-0 text-sm font-medium text-[#475467] hover:text-[#172033]" href={href}>
          查看全部
        </Link>
      </div>
      <div className="mt-4 space-y-2">
        {hasItems ? children : <div className="rounded-md bg-[#f6f7f9] px-3 py-4 text-sm text-[#667085]">暂无待办</div>}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const user = await requirePagePermission("dashboard.view");
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
    orderStatusGroups,
    overdueOutsourceTodoItems,
    todayDueOutsourceTodoItems,
    partialReturnOutsourceTodoItems,
    abnormalReturnItemCount,
    abnormalReturnTodoItems,
    openProductionAbnormalCount,
    openProductionAbnormalItems,
    deliveryTodoProductCount,
    deliveryTodoProducts,
    missingDrawingPartCount,
    missingDrawingParts,
    pendingOrderCount,
    pendingOrders
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
    }),
    prisma.outsourceOrder.findMany({
      where: {
        expectedReturnDate: {
          lt: today
        },
        status: {
          in: [...activeOutsourceStatuses]
        }
      },
      orderBy: {
        expectedReturnDate: "asc"
      },
      take: 5,
      select: {
        id: true,
        outsourceNo: true,
        supplierName: true,
        outsourceType: true,
        expectedReturnDate: true
      }
    }),
    prisma.outsourceOrder.findMany({
      where: {
        expectedReturnDate: {
          gte: today,
          lt: tomorrow
        },
        status: {
          in: [...activeOutsourceStatuses]
        }
      },
      orderBy: {
        expectedReturnDate: "asc"
      },
      take: 5,
      select: {
        id: true,
        outsourceNo: true,
        supplierName: true,
        outsourceType: true,
        expectedReturnDate: true
      }
    }),
    prisma.outsourceOrder.findMany({
      where: {
        status: "PARTIAL_RETURN"
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 5,
      select: {
        id: true,
        outsourceNo: true,
        supplierName: true,
        outsourceType: true,
        outsourceDate: true,
        _count: {
          select: {
            items: true
          }
        }
      }
    }),
    prisma.outsourceReturnItem.count({
      where: {
        abnormalQuantity: {
          gt: 0
        }
      }
    }),
    prisma.outsourceReturnItem.findMany({
      where: {
        abnormalQuantity: {
          gt: 0
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 5,
      select: {
        id: true,
        abnormalQuantity: true,
        abnormalReason: true,
        outsourceReturnId: true,
        outsourceReturn: {
          select: {
            returnDate: true,
            outsourceOrder: {
              select: {
                outsourceNo: true
              }
            }
          }
        },
        outsourceOrderItem: {
          select: {
            productName: true,
            partName: true,
            order: {
              select: {
                orderNo: true
              }
            }
          }
        }
      }
    }),
    prisma.productPartAbnormal.count({
      where: {
        status: "OPEN"
      }
    }),
    prisma.productPartAbnormal.findMany({
      where: {
        status: "OPEN"
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        reason: true,
        order: {
          select: {
            orderNo: true,
            customerName: true,
            customer: {
              select: {
                name: true
              }
            }
          }
        },
        product: {
          select: {
            productName: true
          }
        },
        productPart: {
          select: {
            partCode: true,
            partName: true
          }
        }
      }
    }),
    prisma.product.count({
      where: {
        status: {
          in: [...deliverableProductStatuses]
        }
      }
    }),
    prisma.product.findMany({
      where: {
        status: {
          in: [...deliverableProductStatuses]
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 5,
      select: {
        id: true,
        orderId: true,
        productName: true,
        quantity: true,
        status: true,
        order: {
          select: {
            orderNo: true,
            customerName: true
          }
        }
      }
    }),
    prisma.productPart.count({
      where: {
        drawings: {
          none: {}
        },
        order: {
          status: {
            not: "COMPLETED"
          }
        },
        product: {
          status: {
            not: "COMPLETED"
          }
        }
      }
    }),
    prisma.productPart.findMany({
      where: {
        drawings: {
          none: {}
        },
        order: {
          status: {
            not: "COMPLETED"
          }
        },
        product: {
          status: {
            not: "COMPLETED"
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 5,
      select: {
        id: true,
        orderId: true,
        partName: true,
        partCode: true,
        order: {
          select: {
            orderNo: true,
            customerName: true
          }
        },
        product: {
          select: {
            productName: true
          }
        }
      }
    }),
    prisma.order.count({
      where: {
        status: "PENDING"
      }
    }),
    prisma.order.findMany({
      where: {
        status: "PENDING"
      },
      orderBy: {
        orderDate: "desc"
      },
      take: 5,
      select: {
        id: true,
        orderNo: true,
        customerName: true,
        orderDate: true,
        deliveryDate: true
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
  const todayDateValue = formatDate(today);

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

  const commonActionLinks = [
    { label: "新建订单", href: "/orders" },
    { label: "生产进度", href: "/production" },
    { label: "新建外发单", href: "/outsourcing/new" },
    { label: "回厂登记", href: "/returns" },
    { label: "新建送货单", href: "/delivery/new" },
    { label: "系统备份", href: "/settings/backup" }
  ];

  const commonPrintLinks = [
    { label: "生产日报", href: "/production/daily" },
    { label: "生产异常清单", href: "/production/abnormal" },
    { label: "生产进度跟踪表", href: "/production" }
  ];

  return (
    <div className={pageShell}>
      <section className={pageHeader}>
        <div>
          <h1 className={pageTitle}>金鸿 ERP 首页看板</h1>
          <p className={pageDescription}>
          汇总订单、生产、外发、回厂、齐套、送货和图纸的关键提醒。
          </p>
        </div>
      </section>

      {statGroups.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className={sectionTitle}>{group.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {group.cards.map((card) => (
              <StatCard key={card.title} {...card} />
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className={sectionTitle}>今日待办</h2>
            <p className="mt-1 text-sm text-[#667085]">优先处理超期、异常、待回厂、待送货和资料缺失事项。</p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <TodoCard title="超期未回外发" count={overdueOutsourceOrders} href="/outsourcing?overdue=1" tone="danger" hasItems={overdueOutsourceTodoItems.length > 0}>
            {overdueOutsourceTodoItems.map((item) => (
              <Link
                key={item.id}
                href={`/outsourcing/${item.id}`}
                className="block rounded-md border border-red-100 bg-red-50/60 px-3 py-2 text-sm transition hover:border-red-200 hover:bg-red-50"
              >
                <div className="font-medium text-[#172033]">{item.outsourceNo}</div>
                <div className="mt-1 text-[#667085]">
                  {item.supplierName} · {outsourceTypeLabels[item.outsourceType]} · {formatDate(item.expectedReturnDate)}
                </div>
                <div className="mt-1 font-medium text-red-700">超期 {getOverdueDays(today, item.expectedReturnDate)} 天</div>
              </Link>
            ))}
          </TodoCard>

          <TodoCard
            title="今日应回外发"
            count={todayDueOutsourceOrders}
            href={`/outsourcing?startDate=${todayDateValue}&endDate=${todayDateValue}`}
            tone="warning"
            hasItems={todayDueOutsourceTodoItems.length > 0}
          >
            {todayDueOutsourceTodoItems.map((item) => (
              <Link
                key={item.id}
                href={`/outsourcing/${item.id}`}
                className="block rounded-md border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm transition hover:border-amber-200 hover:bg-amber-50"
              >
                <div className="font-medium text-[#172033]">{item.outsourceNo}</div>
                <div className="mt-1 text-[#667085]">
                  {item.supplierName} · {outsourceTypeLabels[item.outsourceType]} · 预计 {formatDate(item.expectedReturnDate)}
                </div>
              </Link>
            ))}
          </TodoCard>

          <TodoCard title="部分回厂未完成" count={partialReturnOutsourceOrders} href="/outsourcing?status=PARTIAL_RETURN" tone="orange" hasItems={partialReturnOutsourceTodoItems.length > 0}>
            {partialReturnOutsourceTodoItems.map((item) => (
              <Link
                key={item.id}
                href={`/outsourcing/${item.id}`}
                className="block rounded-md border border-orange-100 bg-orange-50/60 px-3 py-2 text-sm transition hover:border-orange-200 hover:bg-orange-50"
              >
                <div className="font-medium text-[#172033]">{item.outsourceNo}</div>
                <div className="mt-1 text-[#667085]">
                  {item.supplierName} · {outsourceTypeLabels[item.outsourceType]} · 外发 {formatDate(item.outsourceDate)}
                </div>
                <div className="mt-1 text-[#667085]">明细 {item._count.items} 条</div>
              </Link>
            ))}
          </TodoCard>

          <TodoCard title="异常回厂" count={abnormalReturnItemCount} href="/returns?abnormal=1" tone="danger" hasItems={abnormalReturnTodoItems.length > 0}>
            {abnormalReturnTodoItems.map((item) => (
              <Link
                key={item.id}
                href={`/returns/${item.outsourceReturnId}`}
                className="block rounded-md border border-red-100 bg-red-50/60 px-3 py-2 text-sm transition hover:border-red-200 hover:bg-red-50"
              >
                <div className="font-medium text-[#172033]">
                  {formatDate(item.outsourceReturn.returnDate)} · {item.outsourceReturn.outsourceOrder.outsourceNo}
                </div>
                <div className="mt-1 text-[#667085]">
                  {item.outsourceOrderItem.productName} · {item.outsourceOrderItem.partName}
                </div>
                <div className="mt-1 font-medium text-red-700">
                  异常 {item.abnormalQuantity} 件 · {item.abnormalReason || "未填写原因"}
                </div>
              </Link>
            ))}
          </TodoCard>

          <TodoCard title="未处理生产异常" count={openProductionAbnormalCount} href="/production/abnormal?status=open" tone="danger" hasItems={openProductionAbnormalItems.length > 0}>
            {openProductionAbnormalItems.map((item) => (
              <Link
                key={item.id}
                href="/production/abnormal?status=open"
                className="block rounded-md border border-red-100 bg-red-50/60 px-3 py-2 text-sm transition hover:border-red-200 hover:bg-red-50"
              >
                <div className="font-medium text-[#172033]">
                  {formatDate(item.createdAt)} · {item.order.orderNo}
                </div>
                <div className="mt-1 text-[#667085]">
                  {item.order.customer.name || item.order.customerName} · {item.product.productName}
                </div>
                <div className="mt-1 text-[#667085]">
                  {item.productPart.partName} · 编号 {item.productPart.partCode || "-"}
                </div>
                <div className="mt-1 font-medium text-red-700">{item.reason}</div>
              </Link>
            ))}
          </TodoCard>

          <TodoCard title="待送货产品" count={deliveryTodoProductCount} href="/delivery/new" tone="info" hasItems={deliveryTodoProducts.length > 0}>
            {deliveryTodoProducts.map((product) => (
              <Link
                key={product.id}
                href={`/orders/${product.orderId}`}
                className="block rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm transition hover:border-blue-200 hover:bg-blue-50"
              >
                <div className="font-medium text-[#172033]">{product.order.orderNo}</div>
                <div className="mt-1 text-[#667085]">
                  {product.order.customerName} · {product.productName} · {product.quantity} 件
                </div>
                <div className="mt-1 text-blue-700">{getProductStatusLabel(product.status)}</div>
              </Link>
            ))}
          </TodoCard>

          <TodoCard title="无图纸部件" count={missingDrawingPartCount} href="/drawings" tone="muted" hasItems={missingDrawingParts.length > 0}>
            {missingDrawingParts.map((part) => (
              <Link
                key={part.id}
                href={`/orders/${part.orderId}`}
                className="block rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-white"
              >
                <div className="font-medium text-[#172033]">{part.order.orderNo}</div>
                <div className="mt-1 text-[#667085]">
                  {part.order.customerName} · {part.product.productName}
                </div>
                <div className="mt-1 text-[#667085]">
                  {part.partName} · 编号 {part.partCode || "-"}
                </div>
              </Link>
            ))}
          </TodoCard>

          <TodoCard title="待处理订单" count={pendingOrderCount} href="/orders?status=PENDING" hasItems={pendingOrders.length > 0}>
            {pendingOrders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block rounded-md border border-[#eef2f6] bg-[#f6f7f9] px-3 py-2 text-sm transition hover:border-[#cfd6e1] hover:bg-white"
              >
                <div className="font-medium text-[#172033]">{order.orderNo}</div>
                <div className="mt-1 text-[#667085]">{order.customerName}</div>
                <div className="mt-1 text-[#667085]">
                  下单 {formatDate(order.orderDate)} · 交货 {formatDate(order.deliveryDate)}
                </div>
              </Link>
            ))}
          </TodoCard>
        </div>
      </section>

      <section className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={sectionTitle}>订单状态统计</h2>
          <Link className="text-sm font-medium text-[#475467] hover:text-[#172033]" href="/orders">
            查看订单
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {orderStatuses.map((status) => (
            <Link
              key={status}
              href={`/orders?status=${status}`}
              className={statCard}
            >
              <div className="break-words text-xs font-medium text-[#667085]">{getOrderStatusLabel(status)}</div>
              <div className="mt-2 text-2xl font-semibold">{orderStatusCountMap.get(status) ?? 0}</div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className={`${card} p-5`}>
          <h2 className={sectionTitle}>常用操作</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {commonActionLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-[#cfd6e1] bg-white px-4 py-3 text-sm font-semibold text-[#344054] shadow-sm transition hover:border-[#98a2b3] hover:bg-[#f6f7f9]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>

        <section className={`${card} p-5`}>
          <h2 className={sectionTitle}>常用打印</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {commonPrintLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-[#cfd6e1] bg-white px-4 py-3 text-sm font-semibold text-[#344054] shadow-sm transition hover:border-[#98a2b3] hover:bg-[#f6f7f9]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
