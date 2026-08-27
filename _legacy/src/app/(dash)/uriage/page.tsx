import { redirect } from "next/navigation";

// 売上明細は売上・回収管理 (/sales) に統合済み — 単一モジュール。
export default function UriagePage() {
  redirect("/sales");
}
