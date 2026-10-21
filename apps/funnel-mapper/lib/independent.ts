import "server-only";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./supabase/admin";

/**
 * Independent accounts: a separate person with their own private workspace (no access to the Layer2Funnels team
 * workspace, and none to theirs for the team). The pending sign-up row makes the database create the personal
 * workspace in the same transaction that creates the account (see handle_new_user()), then Supabase emails an
 * invite link to choose a password; the row is removed straight after. Server-only: uses the service role.
 */
export async function startIndependentSignup(d: { email: string; full_name: string; workspace_name: string }, siteUrl: string): Promise<{ error?: string; exists?: boolean }> {
  const admin = supabaseAdmin();
  if (!admin) return { error: "Independent accounts need SUPABASE_SERVICE_ROLE_KEY on the server." };
  const email = d.email.trim().toLowerCase();
  const pending = await admin.from("workspace_signups").upsert({ email, full_name: d.full_name, workspace_name: d.workspace_name, join_workspace_id: null });
  if (pending.error) return { error: pending.error.message };
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: d.full_name, workspace_kind: "personal" },
    redirectTo: siteUrl ? `${siteUrl}/auth/callback?next=/update-password` : undefined,
  });
  // the account (if any) now exists, so the pending row has done its job either way
  await admin.from("workspace_signups").delete().eq("email", email);
  if (error) return /already/i.test(error.message) ? { exists: true } : { error: error.message };
  return {};
}

/** Forget any pending independent sign-up for this email (so a team invite can never become a personal workspace). */
export async function clearPendingSignup(email: string) {
  await supabaseAdmin()?.from("workspace_signups").delete().eq("email", email.trim().toLowerCase());
}

/** The private sign-up URL works only when INDEPENDENT_SIGNUP_CODE is set (server-only) and matches. */
export function validJoinCode(code: string) {
  const secret = process.env.INDEPENDENT_SIGNUP_CODE ?? "";
  if (secret.length < 8 || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const a = Buffer.from(code),
    b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
