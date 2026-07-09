import PageHeader from "@/components/ui/PageHeader";
import PropertyManager from "@/components/property/PropertyManager";

export default function PropertiesPage() {
  return (
    <>
      <PageHeader
        title="物件・家賃管理"
        subtitle="地代家賃 › 各物件（寮・マンション）— 支出（会社）と回収（入居者）で実質負担を把握"
      />
      <PropertyManager />
    </>
  );
}
