"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { startIndependentSignup, validJoinCode } from "@/lib/independent";
import { supabaseServer } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
const safeNext = (n: FormDataEntryValue | null) => {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
};

const creds = z.object({ email: z.email("Enter a valid email"), password: z.string().min(8, "Password must be at least 8 characters") });

export async function signInWithPassword(_: AuthState, fd: FormData): Promise<AuthState> {
  const p = creds.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { error: p.error.issues[0].message };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword(p.data);
  if (error) return { error: error.message === "Invalid login credentials" ? "Wrong email or password." : error.message };
  redirect(safeNext(fd.get("next")));
}

export async function signInWithMagicLink(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = z.email().safeParse(fd.get("email"));
  if (!email.success) return { error: "Enter a valid email" };
  const sb = await supabaseServer();
  const next = safeNext(fd.get("next"));
  // Invite-only: magic links never create accounts (teammates are invited; independent users use the private sign-up).
  const { error } = await sb.auth.signInWithOtp({ email: email.data, options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false } });
  // Same message whether or not the address has an account, so the form can't be used to discover team emails.
  if (error && error.status !== 400 && error.status !== 422) return { error: "Couldn’t send the link. Try again in a minute." };
  return { message: "If that email has an account, a sign-in link is on its way." };
}

export async function requestPasswordReset(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = z.email().safeParse(fd.get("email"));
  if (!email.success) return { error: "Enter a valid email" };
  const sb = await supabaseServer();
  const { error } = await sb.auth.resetPasswordForEmail(email.data, { redirectTo: `${await siteUrl()}/auth/callback?next=/update-password` });
  if (error) return { error: error.message };
  return { message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_: AuthState, fd: FormData): Promise<AuthState> {
  const pw = z.string().min(8, "Password must be at least 8 characters").safeParse(fd.get("password"));
  if (!pw.success) return { error: pw.error.issues[0].message };
  if (fd.get("password") !== fd.get("confirm")) return { error: "Passwords don’t match" };
  const sb = await supabaseServer();
  const { error } = await sb.auth.updateUser({ password: pw.data });
  if (error) return { error: error.message };
  redirect("/");
}

/** Private, unlisted sign-up for independent users (/join/<code>): creates an account with its own private workspace. */
export async function joinAction(code: string, _: AuthState, fd: FormData): Promise<AuthState> {
  if (!validJoinCode(code)) return { error: "This sign-up link isn’t valid." };
  const p = z
    .object({ email: z.email("Enter a valid email"), full_name: z.string().trim().min(1, "Enter your name").max(120), workspace_name: z.string().trim().max(120).default("") })
    .safeParse({ email: fd.get("email"), full_name: fd.get("full_name") ?? "", workspace_name: fd.get("workspace_name") ?? "" });
  if (!p.success) return { error: p.error.issues[0].message };
  const r = await startIndependentSignup(p.data, await siteUrl());
  if (r.error) return { error: "Couldn’t create the account. Try again in a minute." };
  // Same answer whether or not the email already had an account, so the form can't be used to discover accounts.
  return { message: "Check your email: we’ve sent a link to choose your password. Already have an account? Sign in instead." };
}
