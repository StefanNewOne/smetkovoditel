import "server-only";
import { type CurrentUser, currentUser } from "@/lib/auth";

/**
 * RBAC guards (SM-5). The Master Plan keeps `User.role` as a free string and lists RBAC under
 * Settings (§ Подесувања); it defines no fixed matrix. We enforce a conservative default: a
 * `viewer` role is read-only, and financial mutations require a WRITE role. The role set lives in
 * one constant so the Settings screen can adjust it without touching call sites.
 *
 * Errors are TYPED (status 401/403) so callers surface a proper client-facing message and status,
 * never a 500 (CLAUDE.md Engineering Posture #8).
 */
export class AuthError extends Error {
  readonly status = 401;
  constructor() {
    super("Не сте најавени.");
    this.name = "AuthError";
  }
}
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor() {
    super("Немате дозвола за оваа акција.");
    this.name = "ForbiddenError";
  }
}

/** Roles permitted to mutate financial data. Everyone else (e.g. `viewer`) is read-only. */
export const WRITE_ROLES: readonly string[] = ["admin", "accountant"];

export function requireUser(user: CurrentUser | null): CurrentUser {
  if (!user) throw new AuthError();
  return user;
}

export function hasWriteRole(user: CurrentUser): boolean {
  return WRITE_ROLES.includes(user.role);
}

/** Assert the user exists AND may write, else throw a typed error. Pure — unit-testable. */
export function requireWrite(user: CurrentUser | null): CurrentUser {
  const u = requireUser(user);
  if (!hasWriteRole(u)) throw new ForbiddenError();
  return u;
}

/**
 * Session-bound, non-throwing guard for server actions that return `{ ok:false, error }`. Resolves
 * the actor server-side (never trust the client — CLAUDE.md §11 Auth) and checks the write role.
 */
export async function requireWriter(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; error: string }
> {
  try {
    return { ok: true, user: requireWrite(await currentUser()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Забрането." };
  }
}
