import { clerkMiddleware } from "@clerk/nextjs/server";
import type { ApiError } from "@askwell/shared";
import { NextResponse } from "next/server";
import { SIGN_IN_PATH, SIGN_UP_PATH, routeAccess } from "./lib/auth/routes";

// Clerk reads the session on every matched request. Owner pages and owner API
// routes are gated here first; each page and handler still checks for itself.
export default clerkMiddleware(async (auth, req) => {
  const access = routeAccess(req.nextUrl.pathname);
  if (access === "public") return;

  if (access === "protected-api") {
    const { isAuthenticated } = await auth();
    if (!isAuthenticated) {
      const body: ApiError = { error: { code: "unauthorized", message: "Sign in required." } };
      return NextResponse.json(body, { status: 401 });
    }
    return;
  }

  // Pages: redirect a signed-out visitor to sign-in.
  await auth.protect();
}, { signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH });

export const config = {
  matcher: [
    // Skip Next.js internals, static files (unless found in search params) and
    // the widget paths. The widget runs in third-party iframes and cross-origin
    // fetches, where Clerk's dev-instance handshake redirect would break it:
    // /embed and below, /api/widget/* and /widget.js never reach Clerk. Nor does /relay/*,
    // the PostHog reverse proxy (next.config.ts rewrites it to PostHog).
    "/((?!_next|embed(?:/|$)|relay(?:/|$)|api/widget/|widget\\.js$|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes, except the public widget routes.
    "/(api(?!/widget/)|trpc)(.*)",
  ],
};
