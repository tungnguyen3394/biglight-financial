import { redirect } from "next/navigation";

// 売掛金・回収は売上・回収管理（/sales）に統合 — 同一データフロー。
export default function ReceivablesPage() {
  redirect("/sales");
}
