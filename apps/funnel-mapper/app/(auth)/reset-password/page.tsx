"use client";
import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/form-bits";
import { requestPasswordReset } from "../actions";

export default function ResetPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold">Reset your password</h1>
      <p className="mb-5 text-sm text-muted">Enter your email and we’ll send you a link to choose a new password.</p>
      <form action={action} noValidate>
        <FormMessage state={state} />
        <div className="field">
          <label htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <Submit>Send reset link</Submit>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link className="text-brand underline-offset-2 hover:underline" href="/login">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
