import PageHeader from "@/components/ui/PageHeader";
import OkrManager from "@/components/okr/OkrManager";

export default function OkrPage() {
  return (
    <>
      <PageHeader
        title="OKR / KPI"
        subtitle="Objective + Key Result — 組織全体 → 部署 → 個人 3 cấp, tiến độ tự tổng hợp"
      />
      <OkrManager />
    </>
  );
}
