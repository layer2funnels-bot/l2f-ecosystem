"use client";
import type { EcoResult } from "./core";

/** Browser side: calls an ecosystem operation through Funnel Mapper's same-site relay (app/api/eco/[op]). */
export async function ecoCall<T = Record<string, unknown>>(op: string, input: unknown = {}): Promise<EcoResult<T>> {
  try {
    const res = await fetch(`/api/eco/${op}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input ?? {}) });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: T[]; error?: { code: string; message: string } } | null;
    if (res.ok && body?.ok) return { ok: true, data: body.data ?? [] };
    return { ok: false, status: res.status, code: body?.error?.code ?? "failed", message: body?.error?.message ?? "Something went wrong. Nothing was changed." };
  } catch {
    return { ok: false, status: 0, code: "unavailable", message: "You seem to be offline. Nothing was changed." };
  }
}
