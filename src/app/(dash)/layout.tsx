import Shell from "@/components/Shell";

// Layout dùng chung cho toàn bộ trang quản trị (sidebar + header).
export default function DashLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
