import PageHeader from "@/components/ui/PageHeader";
import UsersManager from "@/components/users/UsersManager";

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="User管理"
        subtitle="Nhân viên & phân quyền — admin bật/tắt module mỗi người được xem"
      />
      <UsersManager />
    </>
  );
}
