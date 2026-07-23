import { requirePagePermission } from "@/lib/auth/authorization";
import { hasPermission } from "@/lib/permissions";
import { ImportExcelManager } from "./import-excel-manager";

export const dynamic = "force-dynamic";

export default async function ExcelImportPage() {
  const user = await requirePagePermission("import.view");
  const canPreviewImport =
    hasPermission(user.role, "import.view", []) &&
    hasPermission(user.role, "import.preview", []) &&
    hasPermission(user.role, "customer.view", []) &&
    hasPermission(user.role, "order.view", []);
  const canExecuteImport =
    hasPermission(user.role, "import.view", []) &&
    hasPermission(user.role, "import.execute", []) &&
    hasPermission(user.role, "customer.view", []) &&
    hasPermission(user.role, "customer.create", []) &&
    hasPermission(user.role, "order.view", []) &&
    hasPermission(user.role, "order.create", []) &&
    hasPermission(user.role, "product.view", []) &&
    hasPermission(user.role, "product.create", []) &&
    hasPermission(user.role, "part.view", []) &&
    hasPermission(user.role, "part.create", []);

  return <ImportExcelManager canPreviewImport={canPreviewImport} canExecuteImport={canExecuteImport} />;
}
