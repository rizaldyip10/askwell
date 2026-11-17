// Which paths need a signed-in owner (project.md §6.2, §8).
// Pure on purpose: `proxy.ts` uses it and the unit tests cover it.
// The proxy check is the first gate only. Each page and owner route handler
// still checks the session itself (`auth.protect()` / `auth()`).

export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
export const DASHBOARD_PATH = "/dashboard";
export const BILLING_PATH = "/dashboard/billing";

/** Owner pages: a signed-out visitor is redirected to sign-in. */
export const PROTECTED_PAGE_PREFIXES = [DASHBOARD_PATH] as const;

/** Owner API routes: a signed-out request gets a 401 JSON error. */
export const PROTECTED_API_PREFIXES = ["/api/projects", "/api/knowledge", "/api/conversations"] as const;

export type RouteAccess = "public" | "protected-page" | "protected-api";

/** True when `pathname` is `prefix` itself or a path below it (`/dashboard`, `/dashboard/x`; not `/dashboardx`). */
export function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Lower-cases and drops trailing slashes, so `/Dashboard/` can't slip past the check. */
export function normalizePath(pathname: string): string {
  const lower = pathname.toLowerCase();
  const trimmed = lower.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function routeAccess(pathname: string): RouteAccess {
  const path = normalizePath(pathname);
  if (PROTECTED_API_PREFIXES.some((p) => matchesPrefix(path, p))) return "protected-api";
  if (PROTECTED_PAGE_PREFIXES.some((p) => matchesPrefix(path, p))) return "protected-page";
  return "public";
}

export function isProtectedRoute(pathname: string): boolean {
  return routeAccess(pathname) !== "public";
}
