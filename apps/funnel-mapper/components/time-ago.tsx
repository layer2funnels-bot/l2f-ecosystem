import { timeAgo } from "@/lib/format";

/**
 * "17 min ago". The wording depends on the clock, so the server's text and the browser's can differ by a minute
 * boundary; React would treat that as a hydration error and re-render the whole page (which also drops the saved theme).
 * The text is not important enough to fail hydration for, so this span opts out of the check.
 */
export function TimeAgo({ iso }: { iso: string }) {
  return <span suppressHydrationWarning>{timeAgo(iso)}</span>;
}
