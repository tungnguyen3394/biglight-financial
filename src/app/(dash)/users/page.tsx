import PageHeader from "@/components/ui/PageHeader";
import UsersManager from "@/components/users/UsersManager";

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="User管理"
        subtitle="従業員と権限管理 — 各ユーザーの閲覧モジュールを管理者が設定"
      />
      <UsersManager />
    </>
  );
}
