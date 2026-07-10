import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "./constants";

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions(expires: Date) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", expires };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashSessionToken(token), expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions(expiresAt));
  return expiresAt;
}

export async function deleteSessionByToken(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", cookieOptions(new Date(0)));
}

export async function getCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { select: { id: true, employeeNo: true, name: true, role: true, isActive: true } } }
  });
}
