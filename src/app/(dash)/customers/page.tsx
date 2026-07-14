import PageHeader from "@/components/ui/PageHeader";
import CustomersManager from "@/components/customers/CustomersManager";

export default function CustomersPage() {
  return (
    <>
      <PageHeader
        title="顧客・契約管理"
        subtitle="顧客・契約 — 顧客をクリックして契約を表示・追加"
      />
      <CustomersManager />
    </>
  );
}
