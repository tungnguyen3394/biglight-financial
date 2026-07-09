import { redirect } from "next/navigation";

// 売掛金・回収 đã GỘP vào 売上・回収管理 (/sales) — cùng 1 dòng chảy dữ liệu.
export default function ReceivablesPage() {
  redirect("/sales");
}
