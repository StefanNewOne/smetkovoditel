import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  name?: string;
  role?: string;
}

const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-change-me-32chars";

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? DEV_FALLBACK_SECRET,
  cookieName: "smetko_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
};

/**
 * The session-signing key must never fall back to a public default in production — a known key lets
 * anyone forge an authenticated admin cookie. Resolved per request (NOT at module load, which would
 * fire during `next build` where the secret is legitimately absent): production without the secret
 * hard-fails at the request boundary instead of silently using the dev key.
 */
function resolveSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET е задолжителен во продукција (нема безбеден default).");
  }
  return secret ?? DEV_FALLBACK_SECRET;
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, {
    ...sessionOptions,
    password: resolveSecret(),
  });
}
