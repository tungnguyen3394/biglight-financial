import PageHeader from "@/components/ui/PageHeader";
import CustomersManager from "@/components/customers/CustomersManager";

export default function CustomersPage() {
  return (
    <>
      <PageHeader
        title="顧客・契約管理"
        subtitle="Khách hàng & hợp đồng — bấm vào từng khách để xem/thêm 契約"
      />
      <CustomersManager />
    </>
  );
}
