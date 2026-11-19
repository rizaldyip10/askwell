import { BILLING_PATH, DASHBOARD_PATH, projectSectionPath } from "../../lib/auth/routes";

export type NavItem = { href: string; label: string };

/** Account-level dashboard nav. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: DASHBOARD_PATH, label: "Projects" },
  { href: BILLING_PATH, label: "Billing" },
];

/**
 * A project's sections, in nav order. `segment` is the path below `/dashboard/projects/<id>`
 * ("" is the overview). Later phases add Conversations and Customize here.
 */
export const PROJECT_SECTIONS: readonly { segment: string; label: string }[] = [
  { segment: "", label: "Overview" },
  { segment: "knowledge", label: "Knowledge" },
  { segment: "install", label: "Install" },
];

/** The per-project nav for one project. */
export function projectNavItems(projectId: string): NavItem[] {
  return PROJECT_SECTIONS.map((section) => ({
    href: projectSectionPath(projectId, section.segment),
    label: section.label,
  }));
}

/**
 * The item for `pathname`: the longest matching href wins, so
 * `/dashboard/billing` highlights "Billing", not "Projects".
 */
export function activeNavHref(pathname: string, items: readonly NavItem[] = NAV_ITEMS): string | null {
  const matches = items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href;
}
