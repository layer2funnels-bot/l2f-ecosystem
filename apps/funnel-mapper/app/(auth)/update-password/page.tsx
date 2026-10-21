"use client";
import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/form-bits";
import { updatePassword } from "../actions";

export default function UpdatePasswordPage() {
  const [state, action] = useActionState(updatePassword, undefined);
  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold">Choose a new password</h1>
      <p className="mb-5 text-sm text-muted">You’re signed in from your reset link. Set a new password to finish.</p>
      <form action={action} noValidate>
        <FormMessage state={state} />
        <div className="field">
          <label htmlFor="password">New password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <Submit>Save password</Submit>
      </form>
    </>
  );
}
