"use client";
import { useEffect, useState } from "react";
import { signedUrls } from "@/lib/eco/upload";

/** Short-lived URL for a stored image (logos, thumbnails, screenshots), signed by the ecosystem API for people allowed to see it. */
export function useSignedUrl(bucket: "thumbnails" | "screenshots" | "logos", path: string | null | undefined, onMissing?: () => void) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!path) return;
    const sign = () =>
      signedUrls([path])
        .then((m) => m[path] ?? null)
        .catch(() => null)
        .then((signed) => {
          if (!alive) return;
          setUrl(signed);
          if (!signed) onMissing?.();
          // a long editing session outlives the link: sign again before it expires
          timer = setTimeout(sign, 50 * 60 * 1000);
        });
    sign();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onMissing only ever flips local state
  }, [bucket, path]);
  return path ? url : null;
}
