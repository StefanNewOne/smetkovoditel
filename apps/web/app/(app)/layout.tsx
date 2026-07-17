import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen min-w-[1180px]">
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 animate-fade-up overflow-y-auto p-7">{children}</main>
      </div>
    </div>
  );
}
