import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

// /admin 인덱스는 별도 화면 없이 후보 검토로 보낸다.
// (관리자 하위 페이지와 동일한 권한 가드를 적용)
export default async function AdminIndexPage() {
  const { user, role } = await getCurrentUserRole();
  if (!user) redirect("/login?next=/admin/review");
  if (role !== "admin") redirect("/");
  redirect("/admin/review");
}
