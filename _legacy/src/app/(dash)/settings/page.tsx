import PageHeader from "@/components/ui/PageHeader";
import DemoData from "@/components/settings/DemoData";
import AccountsMaster from "@/components/settings/AccountsMaster";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="設定" subtitle="システム設定 — 勘定科目マスタ + デモデータ" />
      <div className="space-y-6">
        <DemoData />
        <AccountsMaster />
      </div>
    </>
  );
}
