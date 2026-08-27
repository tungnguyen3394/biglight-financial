import PageHeader from "@/components/ui/PageHeader";
import ReportsManager from "@/components/reports/ReportsManager";

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="レポート"
        subtitle="月次・四半期・年度比較 — 会計年度 8/1〜7/31（Q1=8〜10月）"
      />
      <ReportsManager />
    </>
  );
}
