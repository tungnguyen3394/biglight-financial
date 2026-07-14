import PageHeader from "@/components/ui/PageHeader";
import YojitsuManager from "@/components/yojitsu/YojitsuManager";

export default function YojitsuPage() {
  return (
    <>
      <PageHeader
        title="予実管理"
        subtitle="予算 vs 実績 — 売上高・原価・粗利・販管費・営業利益を12ヶ月で対比"
      />
      <YojitsuManager />
    </>
  );
}
