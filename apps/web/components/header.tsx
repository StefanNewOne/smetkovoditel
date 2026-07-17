"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Smartphone } from "lucide-react";
import { NAV_ITEMS } from "@smetko/shared";

export function Header() {
  const pathname = usePathname();
  const item = NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  const title = item?.label ?? "Финансиски систем";

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3.5 border-b border-border bg-surface px-7">
      <h1 className="text-[16px] font-extrabold text-ink">{title}</h1>
      <div className="ml-auto flex items-center gap-2.5">
        <span className="rounded-lg bg-chip px-3 py-1.5 text-[12px] font-semibold text-muted">
          Gmail sync · пред 4 мин
        </span>
        <Link
          href="/expense"
          className="flex items-center gap-1.5 rounded-lg border border-accent-200 px-3 py-1.5 text-[12px] font-bold text-accent hover:bg-accent-50"
        >
          <Smartphone size={14} />
          Мобилен внес (W6)
        </Link>
      </div>
    </header>
  );
}
