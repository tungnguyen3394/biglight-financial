import PageHeader from "@/components/ui/PageHeader";
import RevenueManager from "@/components/revenue/RevenueManager";

export default function SalesPage() {
  return (
    <>
      <PageHeader
        title="売上・回収管理"
        subtitle="1 nguồn duy nhất: doanh thu (見込→確定) → 請求(税抜/税込) → 入金 → 未回収・延滞"
      />
      <RevenueManager />
    </>
  );
}
