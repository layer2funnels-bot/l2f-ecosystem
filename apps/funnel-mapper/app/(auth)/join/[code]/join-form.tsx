"use client";
import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/form-bits";
import { joinAction } from "../../actions";

export function JoinForm({ code }: { code: string }) {
  const [state, action] = useActionState(joinAction.bind(null, code), undefined);
  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold">Create your workspace</h1>
      <p className="mb-5 text-sm text-muted">You get your own private workspace for your clients and funnels. Nobody else can see it.</p>
      {state?.message ? (
        <FormMessage state={state} />
      ) : (
        <form action={action} noValidate>
          <FormMessage state={state} />
          <div className="field">
            <label htmlFor="join-name">Your name</label>
            <input className="input" id="join-name" name="full_name" autoComplete="name" required />
          </div>
          <div className="field">
            <label htmlFor="join-email">Email</label>
            <input className="input" id="join-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="join-ws">Business or workspace name (optional)</label>
            <input className="input" id="join-ws" name="workspace_name" autoComplete="organization" />
          </div>
          <Submit>Create workspace</Submit>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link className="text-brand underline-offset-2 hover:underline" href="/login">
          Already have an account? Sign in
        </Link>
      </p>
    </>
  );
}
