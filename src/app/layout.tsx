import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "金鸿 ERP",
  description: "五金定制家具工厂订单生产管理系统"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
