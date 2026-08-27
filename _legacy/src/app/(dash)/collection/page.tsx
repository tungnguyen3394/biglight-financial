import PageHeader from "@/components/ui/PageHeader";
import CollectionManager from "@/components/collection/CollectionManager";

export default function CollectionPage() {
  return (
    <>
      <PageHeader
        title="回収管理"
        subtitle="立替・未収の回収管理 — 勘定科目ごとに 支出（会社立替）と回収（対象から）を多階層で把握"
      />
      <CollectionManager />
    </>
  );
}
