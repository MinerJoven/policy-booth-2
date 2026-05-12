import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} | ${SITE_DESCRIPTION}`,
    template: `%s | ${SITE_NAME}`
  },
  description: "面向在德华人的德国官方政策中文整理、筛选、搜索与来源追踪平台。",
  metadataBase: new URL(getSiteUrl())
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body className="antialiased">
        <div className="border-b border-line bg-white px-5 py-1 text-center text-xs leading-5 text-neutral-600">
          中文翻译和解读仅供参考，重要政策请进入链接阅读原文。
        </div>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
