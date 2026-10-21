"use client";
// Responsive bands (V2): xl >= 1440, lg 1280-1439, md 1024-1279, tablet 768-1023, phone < 768.
import { useSyncExternalStore } from "react";

export type Band = "xl" | "lg" | "md" | "tablet" | "phone";

export function bandOf(width: number): Band {
  return width >= 1440 ? "xl" : width >= 1280 ? "lg" : width >= 1024 ? "md" : width >= 768 ? "tablet" : "phone";
}

const queries = ["(min-width: 1440px)", "(min-width: 1280px)", "(min-width: 1024px)", "(min-width: 768px)"];
const subscribe = (cb: () => void) => {
  const ms = queries.map((q) => window.matchMedia(q));
  ms.forEach((m) => m.addEventListener("change", cb));
  return () => ms.forEach((m) => m.removeEventListener("change", cb));
};

/** Current band; "xl" on the server (the first client render matches, then it settles). */
export function useBand(): Band {
  return useSyncExternalStore(
    subscribe,
    () => bandOf(window.innerWidth),
    () => "xl",
  );
}
