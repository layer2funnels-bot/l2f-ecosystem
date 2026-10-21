"use client";
// Per-device library lists (Pinned = favourites, Recent) in browser storage, read through useSyncExternalStore
// (empty on the server, so hydration matches). Shared by the library palette and Quick Add.
import { useSyncExternalStore } from "react";
import { BY_KEY } from "@/lib/library";

export const RECENT_KEY = "fm-lib-recent",
  FAV_KEY = "fm-lib-fav";

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};
const rawList = (k: string) => {
  try {
    return localStorage.getItem(k) || "[]";
  } catch {
    return "[]";
  }
};
const parseList = (raw: string): string[] => {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!BY_KEY[x]) : [];
  } catch {
    return [];
  }
};
export const readList = (k: string) => parseList(rawList(k));
export const writeList = (k: string, v: string[]) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
  listeners.forEach((l) => l());
};
export const useList = (k: string) =>
  parseList(
    useSyncExternalStore(
      subscribe,
      () => rawList(k),
      () => "[]",
    ),
  );

/** Record that a library item was used (feeds Recent). */
export function markUsed(key?: string) {
  if (!key || !BY_KEY[key]) return;
  writeList(RECENT_KEY, [key, ...readList(RECENT_KEY).filter((k) => k !== key)].slice(0, 6));
}
export function toggleFav(key: string) {
  const cur = readList(FAV_KEY);
  writeList(FAV_KEY, cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
}
