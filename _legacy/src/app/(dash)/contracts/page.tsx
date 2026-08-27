import { redirect } from "next/navigation";

// 契約管理は顧客・契約管理（/customers）に統合。
export default function ContractsPage() {
  redirect("/customers");
}
