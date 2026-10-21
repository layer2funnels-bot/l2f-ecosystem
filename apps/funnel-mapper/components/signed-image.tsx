"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Short-lived URL for a file in a private bucket (thumbnails, screenshots). Team members only, via storage RLS. */
export function useSignedUrl(bucket: "thumbnails" | "screenshots", path: string | null | undefined, onMissing?: () => void) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!path) return;
    const sign = () =>
      supabaseBrowser()
        .storage.from(bucket)
        .createSignedUrl(path, 3600)
        .then(({ data }) => {
          if (!alive) return;
          setUrl(data?.signedUrl ?? null);
          if (!data?.signedUrl) onMissing?.();
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
