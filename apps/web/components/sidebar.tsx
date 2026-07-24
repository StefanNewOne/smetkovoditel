"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Clapperboard,
  Download,
  FileText,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Receipt,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { NAV_ITEMS } from "@smetko/shared";
import type { CurrentUser } from "@/lib/auth";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  FileText,
  Download,
  ListChecks,
  Megaphone,
  Wallet,
  Receipt,
  Clapperboard,
  BarChart3,
  Settings,
};

export function Sidebar({
  user,
  openImportCount = 0,
  period = "2026-07",
}: {
  user: CurrentUser;
  openImportCount?: number;
  period?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-border bg-surface px-3.5 py-5 md:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="rounded-md bg-accent px-2 py-1 text-[15px] font-extrabold tracking-[0.5px] text-white">
          GO
        </span>
        <span className="text-[15px] font-extrabold tracking-[2px] text-ink">DIGITAL</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] ${
                active
                  ? "bg-accent-50 font-extrabold text-accent"
                  : "font-semibold text-ink-2 hover:bg-chip"
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.key === "import" && openImportCount > 0 && (
                <span className="rounded-[10px] bg-danger-50 px-2 py-0.5 text-[11px] font-bold text-danger">
                  {openImportCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-border-2 pt-4 text-[11px]">
        <p className="font-bold text-ink">АЛМА ДИЗАЈН ДООЕЛ</p>
        <p className="mt-0.5 text-muted-2">
          {user.name} · {user.role}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-muted-2">
          <span className="inline-block h-2 w-2 rounded-full bg-success" />
          Период {period} · ОТВОРЕН
        </p>
      </div>
    </aside>
  );
}
