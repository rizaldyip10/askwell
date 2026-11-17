import { BILLING_PATH, DASHBOARD_PATH } from "../../lib/auth/routes";

export type NavItem = { href: string; label: string };

/** Account-level dashboard nav. Per-project nav arrives in Phase 2. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: DASHBOARD_PATH, label: "Projects" },
  { href: BILLING_PATH, label: "Billing" },
];

/**
 * The item for `pathname`: the longest matching href wins, so
 * `/dashboard/billing` highlights "Billing", not "Projects".
 */
export function activeNavHref(pathname: string, items: readonly NavItem[] = NAV_ITEMS): string | null {
  const matches = items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href;
}
