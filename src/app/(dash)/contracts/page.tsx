import { redirect } from "next/navigation";

// 契約管理 đã GỘP vào 顧客・契約管理 (/customers).
export default function ContractsPage() {
  redirect("/customers");
}
