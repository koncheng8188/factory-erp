import Link from "next/link";
import { requirePageUser } from "@/lib/auth/current-user";
import { userRoleLabels } from "@/lib/auth/roles";
import { hasPermission, type Permission } from "@/lib/permissions";
import { LogoutButton } from "./logout-button";

type NavigationItem = {
  href: string;
  label: string;
  permission?: Permission;
};

type NavigationGroup = {
  title: string;
  items: readonly NavigationItem[];
};

const menuGroups = [
  { title: "首页", items: [{ href: "/", label: "首页看板" }] },
  { title: "基础资料", items: [{ href: "/customers", label: "客户管理" }, { href: "/products", label: "产品管理", permission: "product.view" }, { href: "/parts", label: "部件管理", permission: "part.view" }, { href: "/drawings", label: "图纸管理" }] },
  { title: "订单生产", items: [{ href: "/orders", label: "订单管理" }, { href: "/production", label: "生产进度" }, { href: "/kitting", label: "齐套检查" }] },
  { title: "外发回厂", items: [{ href: "/outsourcing", label: "外发电镀" }, { href: "/returns", label: "回厂登记" }] },
  { title: "送货出库", items: [{ href: "/delivery", label: "送货管理" }] },
  { title: "报表打印", items: [{ href: "/production/daily", label: "生产日报" }, { href: "/production/abnormal", label: "生产异常" }] },
  { title: "系统工具", items: [{ href: "/imports/excel", label: "Excel 导入" }, { href: "/settings/data", label: "数据管理", permission: "dataManagement.view" }, { href: "/settings/backup", label: "系统备份" }] }
] as const satisfies readonly NavigationGroup[];

function canViewNavigationItem(role: Parameters<typeof hasPermission>[0], item: NavigationItem) {
  return !item.permission || hasPermission(role, item.permission, []);
}

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#172033]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#d8dde6] bg-white shadow-[4px_0_18px_rgba(16,24,40,0.04)] md:block">
        <div className="border-b border-[#d8dde6] px-6 py-6"><div className="text-xl font-semibold tracking-normal text-[#172033]">金鸿 ERP</div><div className="mt-1 text-sm text-[#667085]">订单生产管理</div></div>
        <nav className="space-y-4 px-3 py-4">{menuGroups.map((group) => <div key={group.title} className="space-y-1"><div className="px-3 text-xs font-semibold text-[#98a2b3]">{group.title}</div>{group.items.filter((item) => canViewNavigationItem(user.role, item)).map((item) => <Link key={item.href} href={item.href} className="block rounded-md px-3 py-2.5 text-sm font-medium text-[#344054] transition hover:bg-[#eef2f6] hover:text-[#101828]">{item.label}</Link>)}</div>)}</nav>
      </aside>
      <div className="md:pl-64">
        <header className="sticky top-0 z-10 border-b border-[#d8dde6] bg-white/95 px-5 py-4 backdrop-blur md:px-8">
          <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
            <div><div className="text-xl font-semibold text-[#172033]">金鸿 ERP</div><div className="text-sm text-[#667085]">五金定制家具订单生产管理系统</div></div>
            <div className="flex items-center gap-4"><div className="hidden rounded-md border border-[#d8dde6] bg-[#fbfcfd] px-3 py-2 text-sm font-medium text-[#475467] lg:block">下料 / 焊接 / 抛光 / 外发 / 送货</div><div className="text-right text-sm"><div className="font-medium text-[#172033]">{user.name}</div><div className="text-xs text-[#667085]">{user.employeeNo} · {userRoleLabels[user.role]}</div></div><LogoutButton /></div>
          </div>
        </header>
        <main className="mx-auto max-w-[1680px] px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
