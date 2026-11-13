"use client";
import { useOrgSwitch } from "./workspace-switcher";

/** "Switch to …" on the not-available page: the same organization switch as the sidebar. */
export function SwitchOrgButton({ orgId, name }: { orgId: string; name: string }) {
  const { go, pending, error } = useOrgSwitch();
  return (
    <>
      <button type="button" className="btn primary" disabled={!!pending} onClick={() => void go(orgId)}>
        {pending ? "Switching…" : `Switch to ${name}`}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-bad">
          {error}
        </p>
      )}
    </>
  );
}
