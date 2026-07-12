import Link from "next/link";
import { buttonPrimary, buttonSecondary, card } from "@/lib/ui-styles";

export default function ForbiddenPage() {
  return (
    <section className={`${card} mx-auto max-w-2xl p-8 text-center md:p-12`}>
      <div className="text-sm font-semibold tracking-[0.2em] text-[#667085]">HTTP 403</div>
      <h1 className="mt-3 text-3xl font-semibold text-[#172033]">没有访问权限</h1>
      <p className="mt-4 text-sm leading-6 text-[#667085]">
        当前账号没有访问此功能的权限。如需使用，请联系管理员。
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonPrimary}>返回首页</Link>
        <Link href="/login" className={buttonSecondary}>返回登录页</Link>
      </div>
    </section>
  );
}
