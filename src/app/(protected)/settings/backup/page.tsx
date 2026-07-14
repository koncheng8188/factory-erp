import { requirePagePermission } from "@/lib/auth/authorization";
import BackupManager from "./backup-manager";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  await requirePagePermission("backup.view");

  return <BackupManager />;
}
