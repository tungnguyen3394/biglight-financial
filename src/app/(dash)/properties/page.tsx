import { redirect } from "next/navigation";

// 物件・家賃管理 đã đổi thành 回収管理 (chung) tại /collection.
export default function PropertiesPage() {
  redirect("/collection");
}
