import PageHeader from "@/components/ui/PageHeader";
import YojitsuManager from "@/components/yojitsu/YojitsuManager";

export default function YojitsuPage() {
  return (
    <>
      <PageHeader
        title="予実管理"
        subtitle="Kế hoạch (予算) vs Thực tế (実績) — 売上高・原価・粗利・販管費・営業利益 theo 12 tháng"
      />
      <YojitsuManager />
    </>
  );
}
