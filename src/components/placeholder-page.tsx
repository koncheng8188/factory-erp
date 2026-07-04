type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-[#667085]">{description}</p>
      </section>
      <section className="rounded-md border border-[#d8dde6] bg-white p-6">
        <div className="text-base font-medium">模块占位</div>
        <p className="mt-2 text-sm text-[#667085]">
          当前初始化阶段只建立页面入口，业务表单、列表和接口会在后续迭代中补充。
        </p>
      </section>
    </div>
  );
}
