import type { Metadata } from "next";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "BIGLIGHT Management System",
  description: "BIGLIGHT 社内管理システム — 予実・売上・売掛金・支出・顧客・契約・OKR",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
