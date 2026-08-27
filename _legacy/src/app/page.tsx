import { redirect } from "next/navigation";

// "/" にアクセス → ダッシュボードへリダイレクト。
export default function RootPage() {
  redirect("/dashboard");
}
