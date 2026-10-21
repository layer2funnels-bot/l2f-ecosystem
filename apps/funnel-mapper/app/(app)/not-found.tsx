import Link from "next/link";
import { EmptyState } from "@/components/empty-state";

/** Inside the app: a client or funnel that does not exist or is not in your workspace. Same message for both, so nothing leaks. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-[560px] py-16">
      <EmptyState
        title="You don’t have access to this"
        actions={
          <>
            <Link href="/clients" className="btn primary">
              Back to clients
            </Link>
            <Link href="/funnels" className="btn">
              All funnels
            </Link>
          </>
        }
      >
        It may have been deleted, or it belongs to someone else. Ask an admin of your workspace to add you if you need it.
      </EmptyState>
    </div>
  );
}
