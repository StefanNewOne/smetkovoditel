import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  name?: string;
  role?: string;
}

// The session-signing key must never fall back to a public default in production — a known key lets
// anyone forge an authenticated admin cookie. Hard-fail if it is missing outside local dev.
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET е задолжителен во продукција (нема безбеден default).");
}

export const sessionOptions: SessionOptions = {
  password: sessionSecret ?? "dev-only-insecure-secret-change-me-32chars",
  cookieName: "smetko_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
