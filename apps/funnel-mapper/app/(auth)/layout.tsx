import { BrandMark } from "@/components/icon";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="dotgrid grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-2.5 font-display text-[22px] font-extrabold tracking-tight">
          <BrandMark size={34} /> Funnel Mapper Pro V2
        </div>
        <div className="card p-6 sm:p-7">{children}</div>
      </div>
    </main>
  );
}
