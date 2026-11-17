import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardShell } from "../../components/dashboard/dashboard-shell";

export const metadata: Metadata = { title: "Dashboard" };

// Auth: proxy.ts gates /dashboard/*, and every page calls `auth.protect()` itself.
// A layout check would not re-run on client navigation, so there is none here.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
