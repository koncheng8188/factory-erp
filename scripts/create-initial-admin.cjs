const { randomBytes, scryptSync } = require("crypto");
const { PrismaClient } = require("@prisma/client");

if (typeof process.loadEnvFile === "function") { try { process.loadEnvFile(); } catch {} }
const employeeNo = (process.env.INITIAL_ADMIN_EMPLOYEE_NO || "").trim();
const name = (process.env.INITIAL_ADMIN_NAME || "").trim();
const password = process.env.INITIAL_ADMIN_PASSWORD || "";
if (!process.env.DATABASE_URL) { console.error("未读取到 DATABASE_URL，无法创建初始管理员。"); process.exit(1); }
if (!employeeNo) { console.error("初始管理员员工编号不能为空。"); process.exit(1); }
if (!name) { console.error("初始管理员姓名不能为空。"); process.exit(1); }
if (password.length < 8) { console.error("初始管理员密码至少需要 8 位。"); process.exit(1); }
const prisma = new PrismaClient();
async function main() {
  if (await prisma.user.findUnique({ where: { employeeNo } })) throw new Error("该员工编号已存在，未覆盖已有账号。");
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  await prisma.user.create({ data: { employeeNo, name, passwordHash: `scrypt:v1:${salt.toString("hex")}:${hash.toString("hex")}`, role: "ADMIN", isActive: true } });
  console.log("初始管理员创建成功。");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "创建初始管理员失败。"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
