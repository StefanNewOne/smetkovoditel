import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { countOpenAlerts } from "@/lib/alerts";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const openAlertCount = await countOpenAlerts();

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} openAlertCount={openAlertCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 animate-fade-up overflow-y-auto p-4 md:p-6 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
