"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Smartphone, X } from "lucide-react";
import { NAV_ITEMS } from "@smetko/shared";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const item = NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  const title = item?.label ?? "Финансиски систем";

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-surface px-4 md:px-7">
        <button
          onClick={() => setOpen(true)}
          aria-label="Отвори мени"
          className="-ml-1 rounded-md p-1.5 text-ink hover:bg-chip md:hidden"
        >
          <Menu size={20} />
        </button>
        <h1 className="truncate text-[16px] font-extrabold text-ink">{title}</h1>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="hidden rounded-lg bg-chip px-3 py-1.5 text-[12px] font-semibold text-muted sm:inline-flex">
            Gmail sync · пред 4 мин
          </span>
          <Link
            href="/expense"
            className="flex items-center gap-1.5 rounded-lg border border-accent-200 px-3 py-1.5 text-[12px] font-bold text-accent hover:bg-accent-50"
          >
            <Smartphone size={14} />
            <span className="hidden sm:inline">Мобилен внес (W6)</span>
          </Link>
        </div>
      </header>

      {/* Off-canvas nav drawer (phones — the desktop sidebar is hidden under md). */}
      {open && (
        <div className="fixed inset-0 z-[70] md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-[rgba(20,30,48,0.45)]" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 flex h-full w-[236px] animate-fade-up flex-col bg-surface px-3.5 py-5 shadow-xl"
          >
            <div className="mb-6 flex items-center justify-between px-2">
              <span className="flex items-center gap-2">
                <span className="rounded-md bg-accent px-2 py-1 text-[15px] font-extrabold tracking-[0.5px] text-white">
                  GO
                </span>
                <span className="text-[15px] font-extrabold tracking-[2px] text-ink">DIGITAL</span>
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Затвори мени"
                className="rounded-md p-1 text-muted hover:bg-chip"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5">
              {NAV_ITEMS.map((n) => {
                const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
                return (
                  <Link
                    key={n.key}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={`rounded-md px-3 py-2.5 text-[13.5px] ${
                      active
                        ? "bg-accent-50 font-extrabold text-accent"
                        : "font-semibold text-ink-2 hover:bg-chip"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
