import { redirect } from "next/navigation";
import { getCurrentSession } from "./session";

export type SafeUser = { id: string; employeeNo: string; name: string; role: import("@prisma/client").UserRole; isActive: boolean };

export async function getCurrentUser(): Promise<SafeUser | null> {
  const session = await getCurrentSession();
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;
  return session.user;
}

export async function requireUser() {
  return requirePageUser();
}

export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
