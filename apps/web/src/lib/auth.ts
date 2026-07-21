import { createClient } from "@/lib/supabase/server";

export async function getCurrentUserRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, role: null } as const;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const metadataRole = user.app_metadata.role;
  const isAdmin = profile?.role === "admin" || metadataRole === "admin";
  return { user, role: isAdmin ? "admin" : "user" } as const;
}
