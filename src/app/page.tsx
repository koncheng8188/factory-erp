const stats = [
  { label: "进行中订单", value: "0" },
  { label: "待外发部件", value: "0" },
  { label: "待回厂部件", value: "0" },
  { label: "待送货订单", value: "0" }
];

const stages = ["下料", "焊接", "抛光", "外发", "送货"];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">首页看板</h1>
        <p className="mt-2 text-sm text-[#667085]">
          当前阶段先搭建系统入口，后续接入真实订单、部件、图纸和外发数据。
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-md border border-[#d8dde6] bg-white p-5">
            <div className="text-sm text-[#667085]">{item.label}</div>
            <div className="mt-3 text-3xl font-semibold">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-md border border-[#d8dde6] bg-white p-5">
        <h2 className="text-lg font-semibold">生产流程</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {stages.map((stage, index) => (
            <div key={stage} className="rounded-md border border-[#d8dde6] p-4">
              <div className="text-xs font-medium text-[#667085]">步骤 {index + 1}</div>
              <div className="mt-2 text-base font-semibold">{stage}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
