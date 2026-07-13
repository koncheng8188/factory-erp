import { requirePagePermission } from "@/lib/auth/authorization";
import { ImportExcelManager } from "./import-excel-manager";

export const dynamic = "force-dynamic";

export default async function ExcelImportPage() {
  await requirePagePermission("import.view");

  return <ImportExcelManager />;
}
