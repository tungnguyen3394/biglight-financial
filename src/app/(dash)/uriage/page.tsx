import { redirect } from "next/navigation";

// 売上明細 đã GỘP vào 売上・回収管理 (/sales) — 1 module duy nhất.
export default function UriagePage() {
  redirect("/sales");
}
