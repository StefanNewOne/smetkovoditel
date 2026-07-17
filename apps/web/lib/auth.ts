import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@smetko/db";
import { getSession } from "./session";

export interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

/** Verify credentials against the User table and start a session. Returns null on failure. */
export async function login(email: string, password: string): Promise<CurrentUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  const session = await getSession();
  session.userId = user.id;
  session.name = user.name;
  session.role = user.role;
  await session.save();
  return { id: user.id, name: user.name, role: user.role };
}

export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

/** The authenticated user, or null. Server-side only — re-validate on every mutation. */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.userId || !session.name || !session.role) return null;
  return { id: session.userId, name: session.name, role: session.role };
}
