"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { APP_NAME } from "@askwell/shared";
import { Logo } from "../landing/logo";
import { cn } from "../ui/cn";
import { NAV_ITEMS, activeNavHref } from "./nav-items";

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
      <Logo />
      <span>{APP_NAME}</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const active = activeNavHref(usePathname());
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === active;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex h-10 items-center rounded-control px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                isActive ? "bg-primary text-primary-fg" : "text-fg-muted hover:bg-glass-strong hover:text-fg",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Dashboard frame: a glass sidebar from 768px up; below that, a top bar
 * with a menu button that opens the same nav.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState(pathname);

  // Close the mobile menu after any navigation (links, back/forward).
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar (≥768px) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 p-3 md:block">
        <div className="flex h-full flex-col rounded-panel border border-glass-line bg-glass p-4 shadow-glass backdrop-blur-glass">
          <Brand />
          <nav aria-label="Dashboard" className="mt-8 flex-1">
            <NavLinks />
          </nav>
          <div className="flex items-center gap-3 border-t border-glass-line pt-4">
            <UserButton />
          </div>
        </div>
      </aside>

      {/* Top bar (<768px) */}
      <header className="sticky top-0 z-40 border-b border-glass-line bg-glass-strong backdrop-blur-glass md:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Brand />
          <div className="flex items-center gap-2">
            <UserButton />
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex size-10 items-center justify-center rounded-control text-fg-muted hover:bg-glass hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
            >
              <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
        <nav id={menuId} aria-label="Dashboard" hidden={!menuOpen} className="border-t border-glass-line px-4 py-3">
          <NavLinks onNavigate={() => setMenuOpen(false)} />
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:py-8 lg:px-10">{children}</main>
    </div>
  );
}
