import PageHeader from "@/components/ui/PageHeader";
import ExpensesManager from "@/components/expenses/ExpensesManager";

export default function ExpensesPage() {
  return (
    <>
      <PageHeader
        title="支出管理"
        subtitle="Chi phí 3 tầng: 大分類 › 中分類 › 小分類 — cảnh báo tự động khi vượt 予算"
      />
      <ExpensesManager />
    </>
  );
}
