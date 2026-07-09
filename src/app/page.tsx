import { redirect } from "next/navigation";

// Vào "/" → chuyển thẳng tới Dashboard.
export default function RootPage() {
  redirect("/dashboard");
}
