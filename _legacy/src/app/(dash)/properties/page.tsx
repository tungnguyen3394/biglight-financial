import { redirect } from "next/navigation";

// 物件・家賃管理は回収管理（/collection）に変更。
export default function PropertiesPage() {
  redirect("/collection");
}
