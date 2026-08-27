import PageHeader from "@/components/ui/PageHeader";
import ExpensesManager from "@/components/expenses/ExpensesManager";

export default function ExpensesPage() {
  return (
    <>
      <PageHeader
        title="支出管理"
        subtitle="3階層の費用分類：大分類 › 中分類 › 小分類 — 予算超過時に自動アラート"
      />
      <ExpensesManager />
    </>
  );
}
