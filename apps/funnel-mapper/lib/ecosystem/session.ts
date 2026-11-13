import type { ServiceConfig } from "./clients";

/**
 * The signed-in person's ecosystem session (token + organization) for calls to the ecosystem API.
 * Stage 1: Funnel Mapper still signs in with its own accounts, so there is no ecosystem session yet and this returns null
 * (shared clients then refuse to save rather than save locally). Stage 2 (identity bridge, docs/FMP_MIGRATION_PLAN.md phase 1)
 * replaces this with the shared sign-in: the ecosystem access token from the session cookie and the organization chosen in the shell.
 */
export async function ecosystemSession(): Promise<ServiceConfig | null> {
  return null;
}
