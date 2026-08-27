import Shell from "@/components/Shell";

// 管理画面全体の共通レイアウト（サイドバー＋ヘッダー）。
export default function DashLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
