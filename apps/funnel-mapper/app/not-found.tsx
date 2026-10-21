import Link from "next/link";
import { BrandMark } from "@/components/icon";

/** Shown for any address that does not exist (and for records a person cannot see: the two look the same on purpose). */
export default function NotFound() {
  return (
    <main className="dotgrid grid min-h-full place-items-center px-4">
      <div className="card max-w-[440px] p-8 text-center">
        <div className="mb-3 flex justify-center">
          <BrandMark size={40} />
        </div>
        <h1 className="mb-2 font-display text-2xl font-bold">This page isn’t available</h1>
        <p className="mb-5 text-sm text-muted">The address may be wrong, or it may belong to a workspace you aren’t a member of.</p>
        <Link href="/" className="btn primary">
          Go to home
        </Link>
      </div>
    </main>
  );
}
