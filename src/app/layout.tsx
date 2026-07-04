import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "金鸿 ERP",
  description: "五金定制家具工厂订单生产管理系统"
};

const menuItems = [
  { href: "/", label: "首页看板" },
  { href: "/customers", label: "客户管理" },
  { href: "/orders", label: "订单管理" },
  { href: "/products", label: "产品管理" },
  { href: "/parts", label: "部件管理" },
  { href: "/drawings", label: "图纸管理" },
  { href: "/production", label: "生产进度" },
  { href: "/outsourcing", label: "外发电镀" },
  { href: "/returns", label: "回厂登记" },
  { href: "/kitting", label: "齐套检查" },
  { href: "/delivery", label: "送货管理" }
];

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen bg-[#f6f7f9] text-[#172033]">
          <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#d8dde6] bg-white md:block">
            <div className="border-b border-[#d8dde6] px-6 py-5">
              <div className="text-lg font-semibold">金鸿 ERP</div>
              <div className="mt-1 text-sm text-[#667085]">订单生产管理</div>
            </div>
            <nav className="px-3 py-4">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="mb-1 block rounded-md px-3 py-2 text-sm font-medium text-[#344054] hover:bg-[#eef2f6] hover:text-[#101828]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>

          <div className="md:pl-64">
            <header className="sticky top-0 z-10 border-b border-[#d8dde6] bg-white px-5 py-4 md:px-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold">金鸿 ERP</div>
                  <div className="text-sm text-[#667085]">五金定制家具订单生产管理系统</div>
                </div>
                <div className="rounded-md border border-[#d8dde6] px-3 py-2 text-sm text-[#475467]">
                  下料 / 焊接 / 抛光 / 外发 / 送货
                </div>
              </div>
            </header>

            <main className="px-5 py-6 md:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
