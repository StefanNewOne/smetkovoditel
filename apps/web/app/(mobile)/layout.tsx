import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

/** Minimal shell for mobile-first PWA screens (W6) — no sidebar, full-width, auth-gated. */
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <div className="min-h-screen bg-bg">{children}</div>;
}
