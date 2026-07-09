import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BIGLIGHT Management System",
  description: "Web quản trị nội bộ BIGLIGHT — 予実・売上・売掛金・支出・顧客・契約・OKR",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
