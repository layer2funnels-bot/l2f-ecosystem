// Workspace roles (enforced in the database by supabase/migrations/20261010000000_roles.sql; the UI mirrors them).
export type Role = "owner" | "admin" | "editor" | "viewer";
export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
export const ROLE_HELP: Record<Role, string> = {
  owner: "Everything an admin can do, plus independent accounts and handing over the workspace",
  admin: "Edits everything, invites people, changes roles and branding",
  editor: "Creates and edits clients, funnels, templates and share links",
  viewer: "Sees everything, changes nothing",
};
export const roleLabel = (r: string) => ROLE_LABEL[r as Role] ?? r;
