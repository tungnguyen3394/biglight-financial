import PageHeader from "@/components/ui/PageHeader";
import RevenueManager from "@/components/revenue/RevenueManager";

export default function SalesPage() {
  return (
    <>
      <PageHeader
        title="売上・回収管理"
        subtitle="売上（見込→確定）から請求・入金・未回収・延滞までを一元管理"
      />
      <RevenueManager />
    </>
  );
}
