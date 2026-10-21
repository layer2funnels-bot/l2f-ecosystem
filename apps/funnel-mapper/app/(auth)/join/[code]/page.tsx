import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { validJoinCode } from "@/lib/independent";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create your workspace", robots: { index: false, follow: false } };

/** Private, unlisted sign-up for independent users. 404 unless INDEPENDENT_SIGNUP_CODE is set and matches. */
export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  if (!validJoinCode(code)) notFound();
  return <JoinForm code={code} />;
}
