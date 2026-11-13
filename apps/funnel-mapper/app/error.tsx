"use client";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

/**
 * The page couldn't be loaded (the ecosystem service was busy or out of reach). Like the other ecosystem apps: say so plainly,
 * change nothing, offer "Try again". Never guess that the person has no access.
 */
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <main id="main" className="grid min-h-full place-items-center px-4 py-16">
      <div className="card max-w-[440px] p-6" role="alert">
        <h1 className="mb-2 font-display text-xl font-bold">This page couldn’t load</h1>
        <p className="mb-4 text-sm text-muted">The service is busy or couldn’t be reached. Nothing was changed. Wait a moment, then try again.</p>
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          Try again
        </button>
      </div>
    </main>
  );
}
