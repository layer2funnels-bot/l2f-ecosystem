import { ICONS, UI_ICONS, type IconName, type UiIconName } from "@/lib/icons";

/** Inline SVG icon from the static icon sets (lib/icons.ts). */
export function Icon({ name, className, size = 18, strokeWidth = 2 }: { name: IconName | UiIconName; className?: string; size?: number; strokeWidth?: number }) {
  const body = (UI_ICONS as Record<string, string>)[name] ?? (ICONS as Record<string, string>)[name] ?? ICONS.page;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-lg bg-brand text-brand-ink" style={{ width: size, height: size }}>
      <Icon name="logo" size={Math.round(size * 0.64)} strokeWidth={2.2} />
    </span>
  );
}
