import { createClient } from "@supabase/supabase-js";
import { loadWorkspaceEnvironment } from "@ai-trend-radar/collectors";

const env = loadWorkspaceEnvironment();
const dryRun = process.argv.includes("--dry-run");
const emailFlagIndex = process.argv.indexOf("--email");
const requestedEmail = emailFlagIndex >= 0 ? process.argv[emailFlagIndex + 1]?.toLowerCase() : undefined;
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) throw new Error("Supabase server environment is required");

const client = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 50 });
if (error) throw new Error(`Unable to list auth users: ${error.message}`);

const latestSignedIn = [...data.users]
  .filter((user) => user.last_sign_in_at)
  .sort((a, b) => Date.parse(b.last_sign_in_at ?? "") - Date.parse(a.last_sign_in_at ?? ""))[0];
const latest = requestedEmail
  ? data.users.find((user) => user.email?.toLowerCase() === requestedEmail)
  : latestSignedIn;

if (!latest?.last_sign_in_at) throw new Error("No signed-in owner account was found");
const signedInAt = Date.parse(latest.last_sign_in_at);
if (!requestedEmail && (!Number.isFinite(signedInAt) || Date.now() - signedInAt > 30 * 60 * 1000)) {
  throw new Error("The latest sign-in is older than 30 minutes; sign in again before bootstrapping the owner");
}

if (!dryRun && latest.app_metadata.role !== "admin") {
  const { error: updateError } = await client.auth.admin.updateUserById(latest.id, {
    app_metadata: { ...latest.app_metadata, role: "admin" },
  });
  if (updateError) throw new Error(`Unable to assign owner role: ${updateError.message}`);
}

process.stdout.write(`${JSON.stringify({ userId: latest.id, email: latest.email, currentRole: latest.app_metadata.role ?? "user", requestedRole: "admin", lastSignInAt: latest.last_sign_in_at, dryRun })}\n`);
