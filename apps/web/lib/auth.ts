import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@smetko/db";
import { getSession } from "./session";

export interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

// A fixed valid hash (same cost factor) compared against when the email is unknown, so a missing
// user costs the same as a wrong password — no timing side-channel for user enumeration.
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-real-password", 10);

/** Verify credentials against the User table and start a session. Returns null on failure. */
export async function login(email: string, password: string): Promise<CurrentUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return null;

  // Session fixation: drop any pre-existing (possibly attacker-planted) session, then issue a fresh
  // sealed cookie at the auth boundary.
  const session = await getSession();
  session.destroy();
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
